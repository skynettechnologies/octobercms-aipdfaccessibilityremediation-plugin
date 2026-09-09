<?php

return [
    'plugin' => [
        'name'        => 'AI PDF Accessibility Remediation',
        'description' => 'Upload or crawl for PDFs, run AI accessibility remediation, and download WCAG / PDF-UA conformant files.',
    ],
    'nav' => [
        'upload'     => 'Upload',
        'scan'       => 'Website Scan',
        'remediated' => 'Remediated',
    ],
    'settings' => [
        'upload'     => 'Upload PDFs and run AI accessibility remediation.',
        'scan'       => 'Crawl your website for PDFs and remediate them in bulk.',
        'remediated' => 'Review checks and download remediated PDFs.',
    ],
    'permissions' => [
        'access_documents' => 'Use the PDF remediation workspace',
    ],
    'component' => [
        'name'               => 'PDF Remediation',
        'description'        => 'Renders the AI PDF Accessibility Remediation workspace on a CMS page.',
        'active_domain'      => 'Active domain',
        'active_domain_desc' => 'Domain the Website Scan tab crawls. Leave empty to use the account\'s first domain.',
    ],
    'errors' => [
        'no_email' => 'Could not work out an account address for this site — no administrator is signed in and the site has no host to fall back on.',
        'session'  => 'Could not open a remediation session with the remediation service.',
    ],
];
