# AI PDF Accessibility Remediation: October CMS Plugin

## Overview

The **AI PDF Accessibility Remediation Application** brings **PDF Accessibility
Remediation for WCAG & PDF/UA Compliance** directly into your October CMS
backend. It is both a **PDF Accessibility Checker** and an **AI Remediation
Tool**: upload documents or crawl your website for them, let AI repair the
accessibility barriers automatically, review every check that was applied, and
download conformant files — without leaving your CMS.

It fixes the barriers that make PDFs unusable with assistive technology: missing
tags, incorrect reading order, inaccessible forms and tables, images without
alternate text, and absent document structure, language and metadata.

It supports compliance with **WCAG 2.0, 2.1, 2.2, PDF/UA, ADA, Section 508,
AODA, and EN 301 549 (EAA)**. With plain-language explanations and before/after
examples for every check, even non-technical users can understand what was fixed
and why it mattered.

This plugin is designed for:

- Businesses of all sizes
- Enterprises
- Government and public sector entities
- Website owners
- E-commerce platforms
- Development and maintenance agencies

[**Start with a free AI remediation trial — up to 5 pages!**](https://www.skynettechnologies.com/pdf-accessibility-remediation)

## Why AI PDF Accessibility Remediation?

PDFs are where accessibility compliance quietly fails. A site can pass every
page-level audit and still publish hundreds of untagged documents — reports,
forms, invoices, policies — that screen readers cannot navigate at all.

Remediating them by hand is slow and expensive. This plugin makes it a routine
part of publishing: documents are discovered, repaired and re-checked inside the
CMS your team already uses, so accessible PDFs become the default rather than a
project.

## Key Features

- **AI PDF Remediation** – Automated repair of tags, reading order, alt text, headings, tables and metadata.
- **PDF Accessibility Checker** – Every check reported individually, expandable to a plain-language explanation and a before/after example.
- **Upload or Crawl** – Add files by drag and drop, add a PDF by URL, or sweep your website for every linked PDF.
- **Free Trial** – The free plan covers your first 5 pages; paid plans scale from 50 to 10,000 pages.
- **Bulk Remediation** – Select any number of documents and process them in one run, with live progress.
- **Deep Tag Scan** – Post-remediation verification against the document's tag tree, not just its declared metadata.
- **Authenticated Downloads** – Remediated files are delivered over an authenticated session, never a public link.
- **Zero Configuration** – No settings screen and no API keys to paste; the plugin registers your site automatically on first use.
- **Backend and Frontend** – Use it in the October backend, or place it on a CMS page with the supplied component.
- **Integration with All in One Accessibility® Dashboard** – Plans, usage and billing stay in one place.

## Compliance Standards Supported

- WCAG 2.0, 2.1, 2.2
- PDF/UA (ISO 14289)
- ADA
- Section 508
- AODA
- EN 301 549 (EU / European Accessibility Act)

## How It Works

1. **Add Your PDFs** – Upload files, paste a document URL, or crawl your website for every PDF it links to.
2. **Run AI Remediation** – Select documents and process them in bulk; progress is reported live.
3. **Review & Download** – Inspect each accessibility check with its explanation and before/after example, then download the conformant file.

## Getting Started

1. Visit [PDF Accessibility Remediation](https://www.skynettechnologies.com/pdf-accessibility-remediation).
2. Install the plugin (see **Setup** below).
3. Open **AI PDF Accessibility Remediation** in the October backend — your site is registered automatically on the free plan.
4. Add PDFs, remediate, and download the results.

## Who Can Benefit?

- Website Owners & Businesses
- Developers & Web Agencies
- Government & Public Sector Organizations
- Education, Healthcare & Financial Institutions
- Legal & Compliance Teams
- Publishers & Content Teams
- E-commerce & SaaS Platforms

## Setup

## Install Plugin

- Plugin:install - downloads and installs the plugin by its name. The next example will install a plugin called SkynetTechnologies.AiPdfAccessibilityRemediation.

``` bash
php artisan plugin:install skynettechnologies.aipdfaccessibilityremediation
```

- You may install a plugin from a remote source using the --from option.

``` bash
php artisan plugin:install skynettechnologies.aipdfaccessibilityremediation --from=git@github.com:skynettechnologies/octobercms-aipdfaccessibilityremediation.git
```

- Use the --want option to specify a target branch or version.

``` bash
php artisan plugin:install skynettechnologies.aipdfaccessibilityremediation --from=git@github.com:skynettechnologies/octobercms-aipdfaccessibilityremediation.git --want=dev-main
```

- To install from a copy of this repository, place the plugin at
  `plugins/skynettechnologies/aipdfaccessibilityremediation` and run:

``` bash
php artisan october:migrate
```

### Requirements

- October CMS v4 (built and tested against v4.4 / Laravel 12)
- PHP 7.4+ with the `curl` extension
- Outbound HTTPS to the remediation service

## CORS Policy Configuration

To avoid CORS policy issues, ensure the following URLs are allowed in your website. These URLs should be added to your CORS configuration or trusted domains list.

| **Domain**                                   | **Description**                     | **Usage**                              |
|----------------------------------------------|-------------------------------------|----------------------------------------|
| `https://livepdfapi.skynettechnologies.us`  | AI PDF Remediation API              | Documents, remediation jobs, downloads |
| `https://ada.skynettechnologies.us` | All in One Accessibility® Dashboard | Plan upgrades via autologin            |

## Instructions

1. Update your server's CORS configuration to include these URLs.
2. Ensure wildcard subdomains (`*`) are supported where necessary.
3. Verify the application functionality by testing requests to these domains.
4. If issues persist, consult the documentation for CORS configuration guidance.

### Configuration

- There is no settings screen. Everything the plugin needs is pinned in
  `classes/Config.php` or derived from your site, so it works the moment it is
  installed. Open **AI PDF Accessibility Remediation** from the main menu to
  start using it.

| Constant | Default |
|---|---|
| `API_BASE_URL` | `https://livepdfapi.skynettechnologies.us` |
| `DASHBOARD_URL` | `https://ada.skynettechnologies.us` |
| `PROVISION_API_KEY` | `PDF-REMEDATION-PLAN-CHECK` |
| `PLAN_ID` | `free` |
| `COUNTRY` | `US` |
| `WEBSITE` | empty — uses the host the site is served from. A bare host or a full URL are both accepted. |
| `SHARED_ACCOUNT_EMAIL` | empty — see below |
| `ACTIVE_DOMAIN` | empty — follows the account's first domain |
| `TIMEOUT` / `VERIFY_SSL` | `30` seconds / `true` |

**Account registration.** On first use the plugin registers your site with the
remediation service and opens a session, in a single server-side call — the API
key never reaches the browser:

```
POST {API_BASE_URL}/api/billing/provision-account
     X-Api-Key: <PROVISION_API_KEY>
     { name, email, company_name, website, plan_id, country }
  -> { token, user, isNewToApp, orderId }
```

The call is idempotent, so repeat visits reuse the same account rather than
creating duplicates. `website` is the host your site is served from, and `email`
is the signed-in administrator's address, falling back to `noreply@<host>`.

> **Multiple administrators.** The account is keyed on the signed-in
> administrator's email, so each administrator gets a separate document library.
> To give a whole site one shared library, set `SHARED_ACCOUNT_EMAIL` in
> `classes/Config.php`.

**Changing `WEBSITE` on a live install.** Editing the constant is enough — no
version bump and no re-upload of the whole plugin. Two things can make the
change look like it did not take:

- **PHP OPcache.** On a production server the compiled file is cached. Reload
  PHP-FPM (`sudo systemctl reload php-fpm`) or restart Apache after editing, or
  the old value keeps being used.
- **The browser's cached session.** The page stores its session token in
  `localStorage`, so it would otherwise keep using the previous account until
  that token expired. The plugin now sends an account fingerprint with the page
  and discards the stored token whenever it changes, so a reload is enough.

**Upgrading a plan.** When the selected PDFs exceed the plan's remaining pages,
the coverage modal's *Recommended Plan* button opens the dashboard's autologin
link for your site — `{DASHBOARD_URL}/front/autologin/{base64 host}` — so there
is no second login to get through. The link opens in a new tab.

**Permissions.** Grant `skynettechnologies.aipdfaccessibilityremediation.access_documents`
to any backend role that should use the workspace.

**Frontend component.** To run the workspace on a CMS page instead of the
backend, add the component to a page. It requires a signed-in visitor, since a
session grants access to every document on the account:

```
url = "/pdf-remediation"
layout = "default"
==
{% component 'aiPdfAccessibilityRemediation' %}
```

## Screenshots

_Screenshots pending._ Publish the images, then uncomment the lines below and
point them at the real asset URLs — the paths here follow the naming used by our
other October CMS plugin and do not exist yet.

<!--
![AI_PDF_Accessibility_Remediation_Image_1](https://www.skynettechnologies.com/sites/default/files/AiPdfAccessibilityRemediation/AI_PDF_Accessibility_Remediation_Image_1.jpg)
![AI_PDF_Accessibility_Remediation_Image_2](https://www.skynettechnologies.com/sites/default/files/AiPdfAccessibilityRemediation/AI_PDF_Accessibility_Remediation_Image_2.jpg)
![AI_PDF_Accessibility_Remediation_Image_3](https://www.skynettechnologies.com/sites/default/files/AiPdfAccessibilityRemediation/AI_PDF_Accessibility_Remediation_Image_3.jpg)
-->

## Video

_Video pending._ Add the walkthrough here in the same form the Scanner plugin
uses:

<!--
[![AI PDF Accessibility Remediation](https://img.youtube.com/vi/VIDEO_ID/0.jpg)](https://www.youtube.com/watch?v=VIDEO_ID)
-->

## Submit a Support Request

Please visit our **[support page](https://www.skynettechnologies.com/report-accessibility-problem)** and fill out the form. Our team will get back to you as soon as possible.

## Send Us an Email

Alternatively, you can send an email to our support team:
**[hello@skynettechnologies.com](mailto:hello@skynettechnologies.com)**

## Accessibility Partnership Opportunities

### **[Accessibility Agency Partnership](https://www.skynettechnologies.com/agency-partners)**

Partner with us as an agency to provide comprehensive accessibility solutions to your existing clients. Get access to exclusive resources, training, and support to help you implement and manage accessibility features effectively.

### **[Accessibility Affiliate Partnership](https://www.skynettechnologies.com/affiliate-partner)**

Join our affiliate program and earn hefty commissions by promoting AI PDF Accessibility Remediation. Share our accessibility solution within your network and help businesses improve their document accessibility while generating additional revenue.

For more details, please visit **[Accessibility Partnership Opportunities Page](https://www.skynettechnologies.com/partner-program)**.

## Credits

This **AI PDF Accessibility Remediation Application** is developed and maintained by **[Skynet Technologies USA LLC](https://www.skynettechnologies.com)**
