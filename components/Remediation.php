<?php namespace SkynetTechnologies\AiPdfAccessibilityRemediation\Components;

use Cms\Classes\ComponentBase;
use SkynetTechnologies\AiPdfAccessibilityRemediation\Classes\ApiClient;
use SkynetTechnologies\AiPdfAccessibilityRemediation\Classes\Config;

/**
 * Renders the remediation workspace on a CMS page.
 *
 * The same screen as the backend controller, for sites that would rather run it
 * behind their own front-end login than in the October backend.
 */
class Remediation extends ComponentBase
{
    public function componentDetails()
    {
        return [
            'name'        => 'skynettechnologies.aipdfaccessibilityremediation::lang.component.name',
            'description' => 'skynettechnologies.aipdfaccessibilityremediation::lang.component.description',
        ];
    }

    public function defineProperties()
    {
        return [
            'activeDomain' => [
                'title'       => 'skynettechnologies.aipdfaccessibilityremediation::lang.component.active_domain',
                'description' => 'skynettechnologies.aipdfaccessibilityremediation::lang.component.active_domain_desc',
                'type'        => 'string',
                'default'     => '',
            ],
        ];
    }

    public function onRun()
    {
        $this->addCss('assets/css/pdf-remediation.css');
        $this->addJs('assets/js/icons.js');
        $this->addJs('assets/js/api.js');
        $this->addJs('assets/js/app.js');
    }

    /** The shared markup, rendered as-is into the Twig partial. */
    public function workspaceHtml(): string
    {
        return (string) file_get_contents(
            plugins_path('skynettechnologies/aipdfaccessibilityremediation/partials/workspace.htm')
        );
    }

    /** Endpoints handed to the browser — never the auth code. */
    public function browserConfig(): string
    {
        $config = (new ApiClient())->browserConfig(url('aipdfaccessibilityremediation/session'));

        // A page-level override beats the pinned default, so one install can
        // host a page per site it manages.
        if ($this->property('activeDomain')) {
            $config['activeDomain'] = $this->property('activeDomain');
        }

        return json_encode($config, JSON_UNESCAPED_SLASHES);
    }

    /**
     * Whether the visitor may use the workspace at all. The session route
     * refuses anonymous callers, so rendering the screen for them would only
     * produce a wall of failed requests.
     */
    public function canUse(): bool
    {
        return ApiClient::callerIsAuthenticated();
    }
}
