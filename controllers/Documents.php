<?php namespace SkynetTechnologies\AiPdfAccessibilityRemediation\Controllers;

use BackendMenu;
use Backend\Classes\Controller;
use SkynetTechnologies\AiPdfAccessibilityRemediation\Classes\ApiClient;

/**
 * The remediation workspace inside the backend.
 *
 * The screen itself is a self-contained JS application (assets/js/app.js); this
 * controller supplies its configuration and the session endpoint behind it.
 */
class Documents extends Controller
{
    public $requiredPermissions = ['skynettechnologies.aipdfaccessibilityremediation.access_documents'];

    /** Bump with the plugin version to force browsers to refetch the assets. */
    const ASSET_VERSION = '1.0.0';

    public function __construct()
    {
        parent::__construct();

        // The side menu mirrors the in-page tabs, so the highlighted item has to
        // follow `?tab=` rather than being fixed.
        BackendMenu::setContext(
            'SkynetTechnologies.AiPdfAccessibilityRemediation',
            'aipdfaccessibilityremediation',
            self::activeTab()
        );

        // Versioned so a browser cannot serve a stale api.js after an upgrade —
        // the symptom of that is an old cached session surviving a config change.
        $v = self::ASSET_VERSION;
        $base = '/plugins/skynettechnologies/aipdfaccessibilityremediation/assets';

        $this->addCss($base . '/css/pdf-remediation.css?v=' . $v, 'SkynetTechnologies.AiPdfAccessibilityRemediation');
        $this->addJs($base . '/js/icons.js?v=' . $v, 'SkynetTechnologies.AiPdfAccessibilityRemediation');
        $this->addJs($base . '/js/api.js?v=' . $v, 'SkynetTechnologies.AiPdfAccessibilityRemediation');
        $this->addJs($base . '/js/app.js?v=' . $v, 'SkynetTechnologies.AiPdfAccessibilityRemediation');
    }

    /** The tab named in `?tab=`, defaulting to Upload. */
    protected static function activeTab(): string
    {
        $tab = (string) request()->get('tab', 'upload');

        return in_array($tab, ['upload', 'scan', 'remediated'], true) ? $tab : 'upload';
    }

    public function index()
    {
        $this->pageTitle = 'skynettechnologies.aipdfaccessibilityremediation::lang.plugin.name';

        $config = (new ApiClient())->browserConfig(
            \Backend::url('skynettechnologies/aipdfaccessibilityremediation/documents/session')
        );
        $config['initialTab'] = self::activeTab();

        $this->vars['browserConfig'] = $config;
    }

    /**
     * Session endpoint the browser calls on boot and whenever its JWT expires.
     * Reached as a plain POST rather than an October AJAX handler so the JS
     * layer stays framework-agnostic and works unchanged on the CMS frontend.
     */
    public function session()
    {
        try {
            return response()->json((new ApiClient())->createSession());
        }
        catch (\Exception $ex) {
            return response()->json(['error' => $ex->getMessage()], 422);
        }
    }
}
