<?php namespace SkynetTechnologies\AiPdfAccessibilityRemediation;

use Backend;
use System\Classes\PluginBase;

/**
 * AI PDF Accessibility Remediation.
 *
 * Brings the AI PDF Remediation workspace into October CMS: upload PDFs or
 * discover them by crawling a site, run AI accessibility remediation, review
 * the per-check findings and download the remediated files.
 *
 * There is no settings form — the connection is pinned in Classes\Config, so
 * the plugin works the moment it is installed.
 */
class Plugin extends PluginBase
{
    public function pluginDetails()
    {
        return [
            'name'        => 'skynettechnologies.aipdfaccessibilityremediation::lang.plugin.name',
            'description' => 'skynettechnologies.aipdfaccessibilityremediation::lang.plugin.description',
            'author'      => 'Skynet Technologies USA LLC',
            'icon'        => 'icon-file-pdf-o',
            'homepage'    => 'https://www.skynettechnologies.com',
        ];
    }

    public function registerComponents()
    {
        return [
            \SkynetTechnologies\AiPdfAccessibilityRemediation\Components\Remediation::class => 'aiPdfAccessibilityRemediation',
        ];
    }

    /**
     * The workspace, with a side menu mirroring its three tabs.
     *
     * Each item lands on the same screen and opens the tab named in `?tab=`,
     * so the sidebar and the in-page tabs stay in step instead of offering two
     * competing ways to navigate.
     */
    public function registerNavigation()
    {
        $url = Backend::url('skynettechnologies/aipdfaccessibilityremediation/documents');

        return [
            'aipdfaccessibilityremediation' => [
                'label'       => 'skynettechnologies.aipdfaccessibilityremediation::lang.plugin.name',
                'url'         => $url,
                'icon'        => 'icon-file-pdf-o',
                'permissions' => ['skynettechnologies.aipdfaccessibilityremediation.*'],
                'order'       => 500,

                'sideMenu' => [
                    'upload' => [
                        'label'       => 'skynettechnologies.aipdfaccessibilityremediation::lang.nav.upload',
                        'icon'        => 'icon-upload',
                        'url'         => $url,
                        'permissions' => ['skynettechnologies.aipdfaccessibilityremediation.access_documents'],
                    ],
                    'scan' => [
                        'label'       => 'skynettechnologies.aipdfaccessibilityremediation::lang.nav.scan',
                        'icon'        => 'icon-link',
                        'url'         => $url . '?tab=scan',
                        'permissions' => ['skynettechnologies.aipdfaccessibilityremediation.access_documents'],
                    ],
                    'remediated' => [
                        'label'       => 'skynettechnologies.aipdfaccessibilityremediation::lang.nav.remediated',
                        'icon'        => 'icon-file-text-o',
                        'url'         => $url . '?tab=remediated',
                        'permissions' => ['skynettechnologies.aipdfaccessibilityremediation.access_documents'],
                    ],
                ],
            ],
        ];
    }

    /**
     * Settings entries alongside the other Skynet plugins.
     *
     * One per tab rather than a single entry, so the Settings sidebar offers
     * the same three destinations as the plugin's own menu instead of a lone
     * link the reader has to follow to find out what is behind it.
     *
     * Each carries `url` rather than `class`: there is nothing to configure, so
     * they open the workspace directly. October only uses `class` to derive a
     * URL when one is not given.
     */
    public function registerSettings()
    {
        $url = Backend::url('skynettechnologies/aipdfaccessibilityremediation/documents');
        $lang = 'skynettechnologies.aipdfaccessibilityremediation::lang.';
        $items = [];

        $tabs = [
            'upload'     => ['', 'icon-upload', 500],
            'scan'       => ['?tab=scan', 'icon-link', 510],
            'remediated' => ['?tab=remediated', 'icon-file-text-o', 520],
        ];

        foreach ($tabs as $code => [$query, $icon, $order]) {
            $items['aipdfaccessibilityremediation_' . $code] = [
                'label'       => $lang . 'nav.' . $code,
                'description' => $lang . 'settings.' . $code,
                'category'    => $lang . 'plugin.name',
                'icon'        => $icon,
                'url'         => $url . $query,
                'order'       => $order,
                'keywords'    => 'pdf accessibility remediation ada wcag pdf/ua',
                'permissions' => ['skynettechnologies.aipdfaccessibilityremediation.access_documents'],
            ];
        }

        return $items;
    }

    public function registerPermissions()
    {
        return [
            'skynettechnologies.aipdfaccessibilityremediation.access_documents' => [
                'tab'   => 'skynettechnologies.aipdfaccessibilityremediation::lang.plugin.name',
                'label' => 'skynettechnologies.aipdfaccessibilityremediation::lang.permissions.access_documents',
            ],
        ];
    }
}
