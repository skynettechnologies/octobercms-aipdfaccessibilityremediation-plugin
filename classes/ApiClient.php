<?php namespace SkynetTechnologies\AiPdfAccessibilityRemediation\Classes;

use ApplicationException;
use Lang;

/**
 * Server-side half of the remediation service handshake.
 *
 * One call does both jobs — it registers the account on first use and returns a
 * session on every use thereafter:
 *
 *   POST {API_BASE_URL}/api/billing/provision-account
 *     X-Api-Key: <PROVISION_API_KEY>
 *     { name, email, company_name, website, plan_id, country }
 *     -> { token: <JWT>, user: {...}, isNewToApp: bool, orderId }
 *
 * It is idempotent: the same email comes back as the same account with
 * `isNewToApp: false`, so there is no separate registration step to guard and
 * no risk of provisioning duplicates on repeat calls.
 *
 * The API key never leaves the server — the browser asks October for a session
 * and receives only the short-lived JWT.
 *
 * Written against cURL rather than the Http facade so the plugin does not depend
 * on a particular Laravel version underneath October.
 */
class ApiClient
{
    /**
     * Registers the account if needed and opens a session on it.
     *
     * @return array{token: string, user: array, isNewToApp: bool}
     * @throws ApplicationException
     */
    public function createSession(): array
    {
        $email = Config::accountEmail();
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            // Happens only with no request context and no configured override —
            // the service rejects a blank email, so say so before calling it.
            throw new ApplicationException(Lang::get('skynettechnologies.aipdfaccessibilityremediation::lang.errors.no_email'));
        }

        $response = $this->post(Config::API_BASE_URL . '/api/billing/provision-account', [
            'headers' => [
                'X-Api-Key: ' . Config::PROVISION_API_KEY,
                'Content-Type: application/json',
            ],
            'body' => json_encode([
                'name'         => Config::accountName(),
                'email'        => $email,
                'company_name' => Config::companyName(),
                'website'      => Config::website(),
                'plan_id'      => Config::PLAN_ID,
                'country'      => Config::COUNTRY,
            ]),
        ]);

        $data = json_decode($response['body'], true);

        if ($response['status'] !== 200 || empty($data['token'])) {
            // The service explains itself well (bad key, invalid email); pass
            // that through rather than replacing it with something vaguer.
            throw new ApplicationException(
                $data['error'] ?? Lang::get('skynettechnologies.aipdfaccessibilityremediation::lang.errors.session')
            );
        }

        return [
            'token'      => $data['token'],
            'user'       => $data['user'] ?? [],
            'isNewToApp' => (bool) ($data['isNewToApp'] ?? false),
        ];
    }

    /**
     * @return array{status: int, body: string}
     * @throws ApplicationException on transport failure (DNS, TLS, timeout)
     */
    protected function post(string $url, array $options = []): array
    {
        $handle = curl_init($url);

        curl_setopt_array($handle, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT        => Config::TIMEOUT,
            CURLOPT_SSL_VERIFYPEER => Config::VERIFY_SSL,
            CURLOPT_SSL_VERIFYHOST => Config::VERIFY_SSL ? 2 : 0,
            CURLOPT_HTTPHEADER     => $options['headers'] ?? [],
            CURLOPT_POSTFIELDS     => $options['body'] ?? '',
        ]);

        $body = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        $error = curl_error($handle);
        curl_close($handle);

        if ($body === false) {
            // Surfaces the real cause — an expired certificate or a host that
            // resolves but refuses the handshake reads as a blank failure
            // otherwise.
            throw new ApplicationException('Could not reach ' . parse_url($url, PHP_URL_HOST) . ': ' . $error);
        }

        return ['status' => $status, 'body' => (string) $body];
    }

    /**
     * Whether the current request may open a session.
     *
     * A session grants access to every document on the account, so the frontend
     * route must not be public. Backend users pass; frontend users pass when a
     * user plugin (RainLab.User and friends) is providing them. With neither,
     * nothing passes — the component is not usable anonymously by design.
     */
    public static function callerIsAuthenticated(): bool
    {
        try {
            if (\BackendAuth::check()) {
                return true;
            }
        }
        catch (\Throwable $ex) {
            // Backend module unavailable — fall through to the frontend check.
        }

        // `Auth` is an October alias that stays unbound until a user plugin
        // claims it, and an unbound facade resolves to the accessor string
        // rather than throwing. Confirm we have a real object with check()
        // before calling it, or a site with no user plugin fatals here.
        try {
            $auth = \Auth::getFacadeRoot();
            if (is_object($auth) && method_exists($auth, 'check') && $auth->check()) {
                return true;
            }
        }
        catch (\Throwable $ex) {
            // No frontend auth on this site.
        }

        return false;
    }

    /**
     * Configuration handed to the browser. Note what is absent: the API key and
     * the account's identity never leave the server.
     */
    public function browserConfig(string $sessionUrl): array
    {
        return [
            'apiBaseUrl'   => Config::API_BASE_URL,
            'sessionUrl'   => $sessionUrl,
            'csrfToken'    => csrf_token(),
            'activeDomain' => Config::ACTIVE_DOMAIN,
            'upgradeUrl'   => Config::upgradeUrl(),

            // The host this install signs in as, echoed back so it can be read
            // straight out of the page when a deployment looks wrong. Not a
            // secret: it is the site's own domain.
            'website'      => Config::website(),

            // Fingerprint of the account this install signs in as. The browser
            // caches its session token, so without this a change to WEBSITE or
            // to the signed-in administrator would go unnoticed until the old
            // token expired — the page would keep using the previous account.
            // A different value here makes the page discard the cached token
            // and sign in again. It identifies nobody on its own.
            'accountKey'   => substr(sha1(Config::website() . '|' . Config::accountEmail()), 0, 12),
        ];
    }
}
