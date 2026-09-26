<?php namespace SkynetTechnologies\AiPdfAccessibilityRemediation\Classes;

/**
 * Fixed connection settings and the values sent when provisioning an account.
 *
 * The plugin has no settings screen: everything it needs is pinned here or
 * derived from the site, so an install is drop-in and there is nothing for an
 * administrator to fill in or get wrong. Change a value by editing this file.
 */
class Config
{
    /** Origin of the AI PDF Remediation backend. No trailing slash, no /api. */
    const API_BASE_URL = 'https://livepdfapi.skynettechnologies.us';

    /** Key for the provisioning endpoint, sent as `X-Api-Key`. */
    const PROVISION_API_KEY = 'PDF-REMEDATION-PLAN-CHECK';

    /** Plan the account is provisioned on. Fixed for now. */
    const PLAN_ID = 'free';

    /**
     * Accessibility dashboard the upgrade button sends people to. Used only to
     * build that link — the plugin makes no API calls against it.
     */
    const DASHBOARD_URL = 'https://ada.skynettechnologies.us';

    /** Country recorded on the account. October has nowhere to read this from. */
    const COUNTRY = 'US';

    /**
     * Website the account is registered against. Empty uses the host the site
     * is being served from, which is the intended behaviour — set it only to
     * pin an install to a domain other than its own.
     */
    const WEBSITE = '';

    /**
     * Pins every install to one account regardless of who is signed in.
     *
     * Leave empty for the default described on accountEmail(). Set it to an
     * address when a site has several administrators and they must all share
     * one document library.
     */
    const SHARED_ACCOUNT_EMAIL = '';

    /**
     * Domain the Website Scan tab crawls. Empty follows the first domain on the
     * account, which is what the remediation service reports back at sign-in.
     */
    const ACTIVE_DOMAIN = '';

    /** Seconds to wait on the provisioning call. */
    const TIMEOUT = 30;

    /** Leave true. Only a staging host with a self-signed certificate needs it off. */
    const VERIFY_SSL = true;

    /**
     * The host this site is served from, e.g. `example.com`.
     *
     * WEBSITE is normalised rather than used verbatim, so it accepts whatever
     * form it is written in — `example.com`, `https://example.com`,
     * `https://example.com/`, or with a port. The service wants a bare host,
     * and the email fallback and autologin link are both built from this.
     */
    public static function website(): string
    {
        if (self::WEBSITE !== '') {
            return self::normalizeHost(self::WEBSITE);
        }

        try {
            return self::normalizeHost((string) request()->getHost());
        }
        catch (\Throwable $ex) {
            // No request context (console, queue).
            return '';
        }
    }

    /** Reduces a URL or host to a bare hostname. */
    protected static function normalizeHost(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        // parse_url only finds a host when a scheme is present.
        if (strpos($value, '//') !== false) {
            $value = (string) parse_url($value, PHP_URL_HOST);
        }
        else {
            $value = explode('/', $value)[0];      // drop any path
            $value = explode('?', $value)[0];
            $value = preg_replace('/:\d+$/', '', $value);  // drop any port
        }

        return strtolower(trim($value, ". \t\n\r\0\x0B"));
    }

    /**
     * The address the account is provisioned under, and therefore the identity
     * whose documents this install sees.
     *
     * Prefers the signed-in backend user, falling back to `noreply@<host>`.
     *
     * NOTE: with several administrators this means each one provisions their
     * own account and sees only their own documents. Set SHARED_ACCOUNT_EMAIL
     * to give the whole site a single shared library.
     */
    public static function accountEmail(): string
    {
        if (self::SHARED_ACCOUNT_EMAIL !== '') {
            return self::SHARED_ACCOUNT_EMAIL;
        }

        $user = self::backendUser();
        if ($user && filter_var($user->email, FILTER_VALIDATE_EMAIL)) {
            return $user->email;
        }

        $host = self::website();
        if ($host === '') {
            return '';
        }

        // Not every host makes a valid email domain: `localhost` and intranet
        // names have no dot, and a bare IP is only legal in bracket form. Both
        // would be rejected here and by the service, so suffix them — the
        // address stays well-formed, derived from this site, and stable for it.
        if (strpos($host, '.') === false || filter_var($host, FILTER_VALIDATE_IP)) {
            $host .= '.local';
        }

        return 'noreply@' . $host;
    }

    /** Person's name on the account — the signed-in admin, else the site. */
    public static function accountName(): string
    {
        $user = self::backendUser();
        if ($user) {
            $name = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''));
            if ($name !== '') {
                return $name;
            }
        }

        return self::companyName();
    }

    /** Company on the account — the site's name, else its host. */
    public static function companyName(): string
    {
        try {
            $name = (string) config('app.name');
            if ($name !== '' && strtolower($name) !== 'october cms') {
                return $name;
            }
        }
        catch (\Throwable $ex) {
            // Fall through to the host.
        }

        return self::website();
    }

    /**
     * Autologin link behind the modal's "Recommended Plan" button: it signs the
     * visitor into the accessibility dashboard for this site and lands them on
     * its plans page.
     *
     * The payload is base64 of "<host>|pf". The "pf" marker tells the dashboard
     * the visitor arrived from PDF remediation, so it opens the PDF plans
     * rather than the general ones.
     */
    public static function upgradeUrl(): string
    {
        $host = self::website();
        if ($host === '') {
            return '';
        }

        return self::DASHBOARD_URL . '/front/autologin/' . base64_encode($host . '|pf');
    }

    /** The signed-in backend user, or null outside a backend session. */
    protected static function backendUser()
    {
        try {
            return \BackendAuth::getUser();
        }
        catch (\Throwable $ex) {
            return null;
        }
    }
}
