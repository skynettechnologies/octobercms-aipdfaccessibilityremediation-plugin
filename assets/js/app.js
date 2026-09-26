/*
 * AI PDF Accessibility Remediation — section behaviour.
 *
 * A vanilla-JS port of the module's three dashboard screens:
 *   DashUploadPage      → Upload tab
 *   DashScanPage        → Website Scan tab
 *   DashRemediatedPage  → Remediated tab
 * plus SuggestionsModal, ConfirmationModal, PartialCoverageModal and the
 * job-polling hook. No site header, sidebar or footer is drawn — the section
 * is meant to be dropped into the host page's content area.
 */
(function () {
  'use strict';

  var API = window.PdfApi;

  /* =================================================================== *
   * State
   * =================================================================== */
  var state = {
    tab: 'upload',
    user: null,
    plans: [],

    /** Full unpaginated document list — drives remediation eligibility. */
    documents: [],
    /** Ids ticked in the tables, across pages. */
    selected: new Set(),

    /** The remediation job currently being polled. */
    job: null,
    jobTimer: null,

    upload: { page: 1, perPage: 10, search: '', docs: [], total: 0 },
    scan: { page: 1, perPage: 10, search: '', status: 'all', docs: [], total: 0 },
    rem: { page: 1, perPage: 10, search: '', source: 'all', docs: [], total: 0 },

    /** Pending action for the confirmation modal. */
    confirm: null,
    /** Pending state for the plan coverage dialog. */
    coverage: null,
    loaders: 0
  };

  var SUBTITLES = {
    upload: 'Add files for AI-powered accessibility remediation.',
    scan: 'Scan this website for PDFs and check their accessibility issues.',
    remediated: 'View, download, and manage completed remediated PDFs.'
  };

  /* =================================================================== *
   * Small helpers
   * =================================================================== */
  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    return window.Icons.get(name, size);
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  /** Debounces search inputs so a keystroke does not fire a request each time. */
  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      var self = this;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fn.apply(self, args);
      }, wait);
    };
  }

  var toastTimer;
  function toast(message, kind) {
    var el = $('toast');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    show(el, true);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      show(el, false);
    }, 4200);
  }

  /** Reference-counted so overlapping fetches do not hide each other's loader. */
  function loading(on) {
    state.loaders = Math.max(0, state.loaders + (on ? 1 : -1));
    show($('tableLoader'), state.loaders > 0);
  }

  function errorMessage(e) {
    return (e && e.message) || 'Something went wrong. Please try again.';
  }

  /**
   * Surfaces a failed sign-in rather than an opaque failure. A 401 only reaches
   * here after the API layer has already tried to re-issue the session once.
   */
  function handleRequestError(e, fallback) {
    if (e && e.status === 401) {
      toast('Could not authenticate with the remediation service.', 'error');
      return;
    }
    toast(errorMessage(e) || fallback, 'error');
  }

  /* =================================================================== *
   * Tabs
   * =================================================================== */
  function switchTab(tab) {
    state.tab = tab;
    state.selected = new Set();

    ['upload', 'scan', 'remediated'].forEach(function (name) {
      var btn = document.querySelector('[data-tab="' + name + '"]');
      btn.classList.toggle('aiopdf_btn-primary', name === tab);
      btn.classList.toggle('active', name === tab);
      show($('panel' + name.charAt(0).toUpperCase() + name.slice(1)), name === tab);
    });

    $('pageSubtitle').textContent = SUBTITLES[tab];

    // Each React page re-fetched the full list on mount; the panels here are
    // persistent, so the tab switch is what keeps eligibility current.
    reloadDocuments();

    if (tab === 'upload') loadUploadTable();
    else if (tab === 'scan') loadScanTable();
    else loadRemediatedTable();
  }

  /* =================================================================== *
   * Pagination (port of components/Pagination.tsx)
   * =================================================================== */
  function renderPagination(container, view, onChange) {
    var totalPages = Math.ceil(view.total / view.perPage) || 0;
    var start = view.total === 0 ? 0 : (view.page - 1) * view.perPage + 1;
    var end = Math.min(view.page * view.perPage, view.total);

    // A three-page window centred as closely as possible on the current page.
    var startPage = Math.max(1, view.page - 1);
    var endPage = Math.min(totalPages, startPage + 2);
    var pages = [];
    for (var i = startPage; i <= endPage; i++) pages.push(i);

    var first = view.page === 1;
    var last = view.page === totalPages || totalPages === 0;

    function item(label, target, disabled, active) {
      return (
        '<li class="page-item' + (disabled ? ' disabled' : '') + (active ? ' active' : '') + '">' +
        '<button class="page-link" data-page="' + target + '"' + (disabled ? ' disabled' : '') + '>' +
        label + '</button></li>'
      );
    }

    container.innerHTML =
      '<div class="record-count"><strong>Showing ' + start + ' - ' + end +
      ' of ' + view.total + ' item(s)</strong></div>' +
      '<ul class="pagination">' +
      item('&laquo;', 1, first) +
      item('&lsaquo;', view.page - 1, first) +
      pages
        .map(function (p) {
          return item(String(p), p, false, p === view.page);
        })
        .join('') +
      item('&rsaquo;', view.page + 1, last) +
      item('&raquo;', totalPages || 1, last) +
      '</ul>';

    container.querySelectorAll('.page-link').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = Number(btn.getAttribute('data-page'));
        if (!target || target < 1 || target > totalPages || target === view.page) return;
        onChange(target);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  /* =================================================================== *
   * Eligibility helpers
   *
   * Selection spans the WHOLE queue, not just the visible page — so these read
   * from `state.documents` (the full list) rather than the table's page.
   * =================================================================== */
  function uploadQueue() {
    return state.documents.filter(function (d) {
      return d.source !== 'web' && d.status === 'ready';
    });
  }

  function scanQueue() {
    var domain = activeDomain();
    return state.documents.filter(function (d) {
      return d.source === 'web' && d.domain === domain && d.status === 'ready';
    });
  }

  function readyDocs() {
    return state.tab === 'scan' ? scanQueue() : uploadQueue();
  }

  function selectedReady() {
    return readyDocs().filter(function (d) {
      return state.selected.has(d.id);
    });
  }

  /**
   * The domain the Website Scan tab crawls: the configured selection when the
   * account actually owns it, otherwise the account's first domain — the same
   * rule DashScanPage applied to the host's selected site.
   */
  function activeDomain() {
    var domains = (state.user && state.user.domains) || [];
    var wanted = API.CONFIG.activeDomain;
    if (wanted && domains.indexOf(wanted) !== -1) return wanted;
    return domains[0] || '';
  }

  function refreshBulkFooter() {
    var sel = selectedReady();
    var pages = sel.reduce(function (sum, d) {
      return sum + (d.pages || 0);
    }, 0);
    var busy = Boolean(state.job && state.job.status === 'processing');
    var prefix = state.tab === 'scan' ? 'scan' : 'upload';

    $(prefix + 'SelCount').textContent = String(sel.length);
    $(prefix + 'SelPages').textContent = String(pages);
    $(prefix + 'StartSelected').disabled = sel.length === 0 || busy;
    if (prefix === 'upload') $('uploadRemoveSelected').disabled = sel.length === 0 || busy;

    // "Select all" reflects the eligible documents on the visible page.
    var view = state.tab === 'scan' ? state.scan : state.upload;
    var eligibleOnPage = view.docs.filter(function (d) {
      return d.status === 'ready';
    });
    var box = $(prefix + 'SelectAll');
    box.checked =
      eligibleOnPage.length > 0 &&
      eligibleOnPage.every(function (d) {
        return state.selected.has(d.id);
      });
  }

  /** Keeps the full list in sync so eligibility survives a page change. */
  function reloadDocuments() {
    return API.fetchDocuments()
      .then(function (docs) {
        state.documents = docs;
        refreshBulkFooter();
      })
      .catch(function () {
        /* the paginated tables still render — this list only gates selection */
      });
  }

  /* =================================================================== *
   * Upload tab
   * =================================================================== */
  function loadUploadTable() {
    var view = state.upload;
    loading(true);
    return API.fetchDocumentsPage({
      type: 'upload',
      page: view.page,
      perPage: view.perPage,
      search: view.search
    })
      .then(function (r) {
        view.docs = r.documents || [];
        view.total = r.total || 0;
        renderUploadTable();
      })
      .catch(function (e) {
        view.docs = [];
        view.total = 0;
        renderUploadTable();
        handleRequestError(e, 'Could not load documents.');
      })
      .finally(function () {
        loading(false);
      });
  }

  function renderUploadTable() {
    var view = state.upload;
    var busy = Boolean(state.job && state.job.status === 'processing');
    var hasSelection = selectedReady().length > 0;

    if (!view.docs.length) {
      show($('uploadTableWrap'), false);
      var empty = $('uploadEmpty');
      empty.textContent = view.search
        ? 'No documents match your search.'
        : 'No documents in the queue — add a PDF above to get started.';
      show(empty, true);
      refreshBulkFooter();
      return;
    }

    show($('uploadEmpty'), false);
    show($('uploadTableWrap'), true);

    $('uploadTbody').innerHTML = view.docs
      .map(function (doc) {
        var scanning = doc.status === 'pending_scan' || doc.status === 'scanning';
        var pagesCell = scanning
          ? '<span class="status-chip scanning">Scanning…</span>'
          : doc.status === 'processing'
            ? '<span class="status-chip processing">Processing</span>'
            : String(doc.pages == null ? '—' : doc.pages);

        return (
          '<tr>' +
          '<td><input type="checkbox" class="checkbox" data-select="' + esc(doc.id) + '"' +
          (state.selected.has(doc.id) ? ' checked' : '') +
          (doc.status !== 'ready' ? ' disabled' : '') +
          ' aria-label="Select ' + esc(doc.name) + '" /></td>' +

          '<td><div class="doc-cell">' +
          '<span class="mini-icon' + (doc.source === 'url' ? ' link' : '') + '">' +
          (doc.source === 'url' ? icon('link', 16) : 'PDF') + '</span>' +
          '<div style="min-width:0">' + esc(doc.name) +
          (doc.sourceUrl ? '<span class="doc-sub">' + esc(doc.sourceUrl) + '</span>' : '') +
          '</div></div></td>' +

          '<td style="text-align:center"><span class="src-chip ' + esc(doc.source) + '">' +
          (doc.source === 'url' ? 'URL' : 'File') + '</span></td>' +

          '<td style="text-align:center">' + pagesCell + '</td>' +

          '<td style="text-align:center"><div class="row-actions">' +
          (doc.status === 'processing'
            ? ''
            : '<button class="link-danger" data-remove="' + esc(doc.id) + '"' +
              (hasSelection || busy ? ' disabled' : '') + '>' +
              icon('x', 14) + ' Remove</button>') +
          '</div></td>' +
          '</tr>'
        );
      })
      .join('');

    renderPagination($('uploadPagination'), view, function (page) {
      view.page = page;
      loadUploadTable();
    });

    refreshBulkFooter();
  }

  function handleFiles(files) {
    if (!files || !files.length) return;

    var accepted = [];
    Array.prototype.forEach.call(files, function (file) {
      if (!/\.pdf$/i.test(file.name)) {
        toast('PDF format only — please choose a .pdf file.', 'error');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast('File is too large. Up to 50 MB is allowed.', 'error');
        return;
      }
      accepted.push(file);
    });
    if (!accepted.length) return;

    $('dropzoneLabel').textContent = 'Uploading…';
    loading(true);

    Promise.all(
      accepted.map(function (file) {
        return API.uploadPdf(file).catch(function (e) {
          handleRequestError(e, 'Upload failed');
          return null;
        });
      })
    )
      .then(function (docs) {
        var ok = docs.filter(Boolean).length;
        if (ok) toast(ok + ' file' + (ok === 1 ? '' : 's') + ' uploaded.', 'success');
      })
      .finally(function () {
        $('dropzoneLabel').textContent = 'Drag and Drop file here';
        loading(false);
        reloadDocuments();
        loadUploadTable();
      });
  }

  /* =================================================================== *
   * Website Scan tab
   * =================================================================== */
  function statusChip(doc) {
    switch (doc.status) {
      case 'scanning':
        return '<span class="status-chip scanning">' + icon('spinner', 13) + ' Scanning</span>';
      case 'pending_scan':
        return (
          '<button class="status-chip pending" style="border:none;cursor:pointer" ' +
          'title="Click to scan now" data-scan="' + esc(doc.id) + '">' +
          icon('warning', 13) + ' Pending scan</button>'
        );
      case 'ready':
        // Scanned and awaiting remediation — labelled "Pending" so it reads
        // consistently with the other pending states.
        return '<span class="status-chip ready">' + icon('info', 12) + ' Pending</span>';
      case 'processing':
        return '<span class="status-chip processing">' + icon('spinner', 13) + ' Remediating</span>';
      case 'remediated':
        return '<span class="status-chip remediated">' + icon('check', 12) + ' Remediated</span>';
      default:
        return '<span class="status-chip error">Error</span>';
    }
  }

  function loadScanTable() {
    var view = state.scan;
    var domain = activeDomain();

    if (!domain) {
      view.docs = [];
      view.total = 0;
      renderScanTable();
      return Promise.resolve();
    }

    loading(true);
    return API.fetchDocumentsPage({
      type: 'scan',
      page: view.page,
      perPage: view.perPage,
      search: view.search,
      status: view.status,
      domain: domain
    })
      .then(function (r) {
        view.docs = r.documents || [];
        view.total = r.total || 0;
        renderScanTable();
      })
      .catch(function (e) {
        view.docs = [];
        view.total = 0;
        renderScanTable();
        handleRequestError(e, 'Could not load scanned documents.');
      })
      .finally(function () {
        loading(false);
      });
  }

  function renderScanTable() {
    var view = state.scan;
    var domain = activeDomain();

    var crawlBtn = $('crawlBtn');
    show(crawlBtn, Boolean(domain));
    if (domain && !crawlBtn.dataset.busy) crawlBtn.textContent = 'Find PDFs on ' + domain;

    if (!view.docs.length) {
      show($('scanTableWrap'), false);
      var empty = $('scanEmpty');
      empty.textContent = !domain
        ? 'Add a website domain to your account to start scanning it for PDFs.'
        : view.search || view.status !== 'all'
          ? 'No documents match your search/filter.'
          : 'No scanned documents yet — click "Find PDFs on ' + domain + '" above.';
      show(empty, true);
      refreshBulkFooter();
      return;
    }

    show($('scanEmpty'), false);
    show($('scanTableWrap'), true);

    $('scanTbody').innerHTML = view.docs
      .map(function (doc) {
        return (
          '<tr>' +
          '<td><input type="checkbox" class="checkbox" data-select="' + esc(doc.id) + '"' +
          (state.selected.has(doc.id) ? ' checked' : '') +
          (doc.status !== 'ready' ? ' disabled' : '') +
          ' aria-label="Select ' + esc(doc.name) + '" /></td>' +

          '<td><div class="doc-cell"><span class="mini-icon">PDF</span>' +
          '<div style="min-width:0">' + esc(doc.name) +
          '<span class="doc-sub">Source: ' +
          (doc.sourceUrl
            ? '<a href="' + esc(doc.sourceUrl) + '" target="_blank" rel="noreferrer">' +
              esc(doc.sourceUrl) + '</a>'
            : 'Uploaded file') +
          '</span></div></div></td>' +

          '<td style="text-align:center">' + (doc.pages || '—') + '</td>' +
          '<td style="text-align:center">' + statusChip(doc) + '</td>' +
          '</tr>'
        );
      })
      .join('');

    renderPagination($('scanPagination'), view, function (page) {
      view.page = page;
      loadScanTable();
    });

    refreshBulkFooter();
  }

  function crawlWebsite() {
    var domain = activeDomain();
    var btn = $('crawlBtn');
    if (!domain || btn.dataset.busy) return;

    btn.dataset.busy = '1';
    btn.disabled = true;
    btn.innerHTML = icon('spinner', 15) + ' Crawling ' + esc(domain) + '…';

    API.crawlDomain(domain)
      .then(function (res) {
        var coverage =
          res.pagesCrawled + ' page' + (res.pagesCrawled === 1 ? '' : 's') + ' crawled' +
          (res.sitemapUrlsFound > 0 ? ', ' + res.sitemapUrlsFound + ' from sitemap' : '');

        // Large sites are swept across several runs — each picks up where the
        // last left off, so say so rather than implying full coverage.
        var truncated = res.truncated
          ? res.sitemapUrlsFound > 0
            ? ' — this is a large site (' + res.sitemapUrlsFound +
              ' pages in its sitemap), so not every page could be checked in one pass; run it again to sweep the next part of the site.'
            : ' — this is a large site, so not every page could be checked in one pass; run it again to keep discovering more.'
          : '';

        if (res.found === 0) {
          toast('No PDF links found on ' + domain + ' (' + coverage + ').' + truncated);
        } else if (res.added === 0) {
          toast('Found ' + res.found + ' PDF' + (res.found === 1 ? '' : 's') + ' on ' + domain +
            ' — all already in your list (' + coverage + ').' + truncated);
        } else {
          toast('Found ' + res.found + ' PDF' + (res.found === 1 ? '' : 's') + ' on ' + domain +
            ' — added ' + res.added + ' new (' + coverage + '). Scanning…' + truncated, 'success');
          // Kick off the scan for each newly discovered document.
          Promise.all(
            (res.documents || []).map(function (d) {
              return API.scanPdfUrl(d.id).catch(function () {
                return null;
              });
            })
          ).then(function () {
            reloadDocuments();
            loadScanTable();
          });
        }
      })
      .catch(function (e) {
        handleRequestError(e, 'Could not crawl the website.');
      })
      .finally(function () {
        delete btn.dataset.busy;
        btn.disabled = Boolean(state.job && state.job.status === 'processing');
        btn.textContent = 'Find PDFs on ' + domain;
        reloadDocuments();
        loadScanTable();
      });
  }

  /* =================================================================== *
   * Remediated tab
   * =================================================================== */
  function loadRemediatedTable() {
    var view = state.rem;
    loading(true);
    return API.fetchDocumentsPage({
      type: 'remediated',
      page: view.page,
      perPage: view.perPage,
      search: view.search,
      source: view.source
    })
      .then(function (r) {
        view.docs = r.documents || [];
        view.total = r.total || 0;
        renderRemediatedTable();
      })
      .catch(function (e) {
        view.docs = [];
        view.total = 0;
        renderRemediatedTable();
        handleRequestError(e, 'Could not load remediated PDFs.');
      })
      .finally(function () {
        loading(false);
      });
  }

  function renderRemediatedTable() {
    var view = state.rem;

    if (!view.docs.length) {
      show($('remTableWrap'), false);
      var empty = $('remEmpty');
      empty.textContent =
        view.search || view.source !== 'all'
          ? 'No remediated PDFs match your search/filter.'
          : 'No remediated PDFs yet — run AI remediation from the Upload or Website Scan tab.';
      show(empty, true);
      return;
    }

    show($('remEmpty'), false);
    show($('remTableWrap'), true);

    $('remTbody').innerHTML = view.docs
      .map(function (doc) {
        var label =
          doc.source === 'web' ? 'Website Scan' : doc.source === 'url' ? 'Scan PDF URL' : 'Upload PDF';
        var name = doc.remediatedName || doc.name;

        return (
          '<tr>' +
          '<td><div class="doc-cell"><span class="mini-icon purple">PDF</span>' + esc(name) + '</div></td>' +
          '<td class="text-center"><span class="src-chip ' + esc(doc.source) + '">' + label + '</span></td>' +
          '<td class="text-center">' + formatDate(doc.remediatedAt) + '</td>' +
          '<td class="text-center">' + (doc.remediatedPages != null ? doc.remediatedPages : doc.pages) + '</td>' +
          '<td class="actions-column" style="text-align:right"><div class="table-actions">' +
          '<button class="btn btn-soft btn-sm" style="white-space:nowrap" data-suggest="' + esc(doc.id) + '">' +
          icon('sparkles', 16) + ' AI Suggestions</button>' +
          '<button class="btn btn-outline btn-sm" data-download="' + esc(doc.id) +
          '" data-name="' + esc(name) + '">' + icon('download', 16) + ' Download</button>' +
          '</div></td>' +
          '</tr>'
        );
      })
      .join('');

    renderPagination($('remPagination'), view, function (page) {
      view.page = page;
      loadRemediatedTable();
    });
  }

  /* =================================================================== *
   * Remediation + job polling (port of useJobPolling)
   * =================================================================== */
  function startRemediation(allowPartial) {
    var docs = selectedReady();
    // Kept for the coverage dialog: the service usually reports the page count
    // back, but when it does not this is the same number the footer showed.
    var pageCount = docs.reduce(function (sum, d) {
      return sum + (d.pages || 0);
    }, 0);
    if (!docs.length) {
      toast('Select at least one scanned document that is ready to remediate.', 'error');
      return;
    }

    loading(true);
    API.startRemediation(
      docs.map(function (d) {
        return d.id;
      }),
      allowPartial
    )
      .then(function (res) {
        state.selected = new Set();
        state.user = res.user || state.user;
        setJob(res.job);
        refreshCurrentTable();
      })
      .catch(function (e) {
        // The service reports both of these when a run cannot proceed as asked.
        // Each opens the coverage dialog, which carries the upgrade link — a
        // toast would state the problem and offer no way out of it.
        if (e && e.code === 'PAGE_LIMIT') {
          openCoverageModal(0, e.data.totalPages || pageCount, true);
        } else if (e && e.code === 'PARTIAL_REQUIRED') {
          openCoverageModal(e.data.pagesRemaining || 0, e.data.totalPages || pageCount, false);
        } else {
          handleRequestError(e, 'Could not start remediation.');
        }
      })
      .finally(function () {
        loading(false);
      });
  }

  function setJob(job) {
    state.job = job;
    renderJobProgress();
    refreshBulkFooter();
    refreshCurrentTable();

    window.clearInterval(state.jobTimer);
    if (!job || job.status !== 'processing') return;

    state.jobTimer = window.setInterval(function () {
      API.pollJob(job.id)
        .then(function (data) {
          state.job = data.job;
          state.user = data.user || state.user;
          renderJobProgress();

          if (data.job && data.job.status === 'completed') {
            window.clearInterval(state.jobTimer);
            toast('Remediation complete! Files are ready in the Remediated tab.', 'success');
            reloadDocuments();
            switchTab('remediated');
            window.setTimeout(function () {
              state.job = null;
              renderJobProgress();
              refreshBulkFooter();
              refreshCurrentTable();
            }, 1200);
          }
        })
        .catch(function () {
          window.clearInterval(state.jobTimer);
          state.job = null;
          renderJobProgress();
          refreshBulkFooter();
          refreshCurrentTable();
        });
    }, 1000);
  }

  /**
   * Paints the progress bar only. Deliberately does NOT re-fetch the tables:
   * this runs on every one-second poll tick, and the rows do not change until
   * the job completes.
   */
  function renderJobProgress() {
    var active = Boolean(state.job && state.job.status === 'processing');
    var width = Math.max(state.job ? state.job.progress || 0 : 0, 4) + '%';

    ['uploadProgress', 'scanProgress'].forEach(function (id) {
      var el = $(id);
      show(el, active);
      el.querySelector('[data-role="fill"]').style.width = width;
    });
  }

  function refreshCurrentTable() {
    if (state.tab === 'upload') loadUploadTable();
    else if (state.tab === 'scan') loadScanTable();
    else loadRemediatedTable();
  }

  /* =================================================================== *
   * Confirmation modal
   * =================================================================== */
  function openConfirm(options) {
    var modal = $('confirmModal');
    modal.querySelector('h2').textContent = options.title;
    modal.querySelector('[data-role="message"]').innerHTML =
      esc(options.message) + (options.itemName ? ' <strong>' + esc(options.itemName) + '</strong>' : '');
    modal.querySelector('[data-role="confirm"]').textContent = options.confirmText || 'Remove';
    state.confirm = options.onConfirm;
    show(modal, true);
  }

  function closeConfirm() {
    state.confirm = null;
    show($('confirmModal'), false);
  }

  function removeDocuments(ids) {
    loading(true);
    Promise.all(
      ids.map(function (id) {
        return API.removeDocument(id).catch(function (e) {
          handleRequestError(e, 'Failed to remove document');
          return null;
        });
      })
    ).finally(function () {
      ids.forEach(function (id) {
        state.selected.delete(id);
      });
      loading(false);
      reloadDocuments();
      refreshCurrentTable();
    });
  }

  /* =================================================================== *
   * AI Suggestions modal (port of SuggestionsModal.tsx)
   * =================================================================== */
  function openSuggestions(docId) {
    var modal = $('suggestionsModal');
    var sub = modal.querySelector('[data-role="sub"]');
    var body = modal.querySelector('[data-role="body"]');

    sub.textContent = '';
    body.innerHTML =
      '<div class="empty-state">' + icon('spinner', 18) + ' Analysing document…</div>';
    show(modal, true);

    API.fetchSuggestions(docId)
      .then(function (data) {
        var items = (data.items || []).slice().sort(function (a, b) {
          // Failed checks first, then passed.
          return a.status === b.status ? 0 : a.status === 'failed' ? -1 : 1;
        });

        sub.textContent =
          data.documentName + ' · ' + data.pages + ' page' + (data.pages === 1 ? '' : 's') + ' · ' +
          items.length + ' check' + (items.length === 1 ? '' : 's') + ' on the ' +
          (data.analyzed === 'remediated' ? 'remediated' : 'original') + ' file' +
          (data.deepScan ? ' (deep tag scan)' : '');

        var summary =
          '<div class="sug-summary">' +
          '<span class="status-chip completed">' + icon('check', 12) + ' ' + data.passed + ' passed</span>' +
          (data.failed > 0
            ? '<span class="status-chip pending">' + icon('warning', 13) + ' ' + data.failed + ' to fix</span>'
            : '<span class="status-chip completed">All checks passed</span>') +
          '</div>';

        var list =
          '<div class="sug-list">' +
          items
            .map(function (item, idx) {
              return (
                '<div class="sug-item ' + esc(item.status) + '" data-sug="' + idx + '">' +
                '<button class="sug-row" data-toggle="' + idx + '" aria-expanded="false">' +
                '<span class="sug-dot ' + esc(item.status) + '">' +
                (item.status === 'passed' ? icon('check', 12) : icon('warning', 13)) + '</span>' +
                '<span class="sug-title">' + esc(item.title) + '</span>' +
                '<span class="sug-detail">' + esc(item.detail) + '</span>' +
                (item.willAutoFix
                  ? '<span class="src-chip file sug-fixchip">Fixed by AI Remediation</span>'
                  : '') +
                '<span class="sug-caret">&#9656;</span>' +
                '</button>' +
                '<div class="sug-body" hidden>' +
                '<p><b>What this means</b><br />' + esc(item.plain) + '</p>' +
                '<p><b>Why it matters</b><br />' + esc(item.why) + '</p>' +
                '<p><b>How it ' + (item.status === 'passed' ? 'was' : 'gets') + ' fixed</b><br />' +
                esc(item.fix) + '</p>' +
                '<div class="sug-example">' +
                '<div class="sug-example-col before"><div class="sug-example-label">Before</div>' +
                '<pre>' + esc(item.example && item.example.before) + '</pre></div>' +
                '<div class="sug-example-col after"><div class="sug-example-label">After</div>' +
                '<pre>' + esc(item.example && item.example.after) + '</pre></div>' +
                '</div></div></div>'
              );
            })
            .join('') +
          '</div>';

        var footnote =
          data.analyzed === 'original' && data.failed > 0
            ? '<p class="sug-footnote">These issues are repaired automatically when you run ' +
              '<b>Add Selected for Remediation</b> on this document.</p>'
            : '';

        body.innerHTML = summary + list + footnote;

        body.querySelectorAll('[data-toggle]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var panel = btn.nextElementSibling;
            var open = panel.hidden;
            panel.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
            btn.querySelector('.sug-caret').innerHTML = open ? '&#9662;' : '&#9656;';
          });
        });
      })
      .catch(function (e) {
        body.innerHTML =
          '<div class="form-error">' + esc(errorMessage(e) || 'Could not analyse this document.') + '</div>';
      });
  }

  /* =================================================================== *
   * Partial coverage modal (port of PartialCoverageModal.tsx)
   * =================================================================== */
  /**
   * Opens the plan coverage dialog.
   *
   * Two cases share this dialog, because both end in the same decision — upgrade
   * or not — and both want the recommended plan and the autologin button:
   *
   *   partial    the plan covers some of the selection, so continuing with the
   *              covered pages is offered alongside upgrading;
   *   exhausted  the plan has no pages left, so there is nothing to continue
   *              with and only the upgrade path is shown.
   *
   * @param {Number} coveredPages Pages the current plan can still process.
   * @param {Number} totalPages Pages the selection contains.
   * @param {Boolean} exhausted Whether the plan has no pages remaining at all.
   */
  function openCoverageModal(coveredPages, totalPages, exhausted) {
    var modal = $('partialModal');
    var isFree = state.user && state.user.planId === 'free';
    var acceptRow = modal.querySelector('[data-role="accept-row"]');
    var continueBtn = modal.querySelector('[data-role="continue"]');
    var actions = modal.querySelector('[data-role="actions"]');

    state.coverage = { covered: coveredPages, total: totalPages, exhausted: Boolean(exhausted) };

    if (exhausted) {
      modal.querySelector('[data-role="title"]').textContent = isFree
        ? 'Your free trial has used all its pages'
        : 'You have used all the pages in your plan';

      modal.querySelector('[data-role="body"]').textContent =
        'This selection needs ' + totalPages + ' page' + (totalPages === 1 ? '' : 's') +
        ', and your ' + (isFree ? 'free trial' : 'current plan') +
        ' has none remaining. Upgrade to carry on remediating.';
    } else {
      modal.querySelector('[data-role="title"]').textContent = isFree
        ? 'Free trial covers the first ' + coveredPages + ' pages'
        : 'Your current plan covers ' + coveredPages + ' of ' + totalPages + ' pages';

      modal.querySelector('[data-role="body"]').textContent =
        'Your PDF' + (totalPages === coveredPages ? '' : 's') + ' contain ' + totalPages +
        ' pages. Upgrade to process all pages, or continue with the ' + coveredPages +
        ' pages included in your current plan.';

      modal.querySelector('[data-role="accept-label"]').textContent =
        'Continue with my ' + (isFree ? 'free plan' : 'current plan') + ' (' + coveredPages + ' pages)';
    }

    // With no pages left there is nothing to continue with, so the whole
    // "carry on with what I have" path is taken off the dialog rather than
    // shown disabled — a checkbox that can never help is only noise.
    modal.querySelector('[data-role="accept"]').checked = false;
    continueBtn.disabled = true;
    show(acceptRow, !exhausted);
    show(continueBtn, !exhausted);
    actions.style.justifyContent = exhausted ? 'center' : 'space-between';

    var pill = modal.querySelector('[data-role="recommended"]');
    var plan = API.recommendPlan(state.plans, totalPages);
    if (plan) {
      pill.querySelector('[data-role="recommended-text"]').innerHTML =
        'Recommended: <b>' + esc(plan.name) + '</b>' +
        '<span style="color:var(--text-muted)"> — ' + plan.pages.toLocaleString() +
        ' pages · $' + plan.price.toLocaleString() + '</span>';
    }
    show(pill, Boolean(plan));

    show(modal, true);
  }

  function closeCoverageModal() {
    state.coverage = null;
    show($('partialModal'), false);
  }

  /* =================================================================== *
   * Wiring
   * =================================================================== */
  function bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });
  }

  function bindUploadTab() {
    var dropzone = $('dropzone');
    var fileInput = $('fileInput');

    dropzone.addEventListener('click', function () {
      fileInput.click();
    });
    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('drag');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('drag');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('drag');
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function () {
      handleFiles(fileInput.files);
      fileInput.value = '';
    });

    $('uploadSearch').addEventListener(
      'input',
      debounce(function (e) {
        state.upload.search = e.target.value.trim();
        state.upload.page = 1; // a new search must not strand us on an empty page
        loadUploadTable();
      }, 350)
    );

    $('uploadPerPage').addEventListener('change', function (e) {
      state.upload.perPage = Number(e.target.value);
      state.upload.page = 1;
      loadUploadTable();
    });

    $('uploadSelectAll').addEventListener('change', function (e) {
      state.upload.docs
        .filter(function (d) {
          return d.status === 'ready';
        })
        .forEach(function (d) {
          if (e.target.checked) state.selected.add(d.id);
          else state.selected.delete(d.id);
        });
      renderUploadTable();
    });

    $('uploadTbody').addEventListener('change', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-select');
      if (!id) return;
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
      renderUploadTable();
    });

    $('uploadTbody').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove]');
      if (!btn || btn.disabled) return;
      var id = btn.getAttribute('data-remove');
      var doc = state.upload.docs.filter(function (d) {
        return d.id === id;
      })[0];
      openConfirm({
        title: 'Remove Document',
        message: 'Are you sure you want to remove',
        itemName: (doc ? doc.name : 'this document') + '?',
        onConfirm: function () {
          removeDocuments([id]);
        }
      });
    });

    $('uploadRemoveSelected').addEventListener('click', function () {
      var ids = selectedReady().map(function (d) {
        return d.id;
      });
      if (!ids.length) return;
      openConfirm({
        title: 'Remove Document',
        message: 'Are you sure you want to remove the selected document?',
        onConfirm: function () {
          removeDocuments(ids);
        }
      });
    });

    $('uploadStartSelected').addEventListener('click', function () {
      startRemediation(false);
    });
  }

  function bindScanTab() {
    $('crawlBtn').addEventListener('click', crawlWebsite);

    $('scanSearch').addEventListener(
      'input',
      debounce(function (e) {
        state.scan.search = e.target.value.trim();
        state.scan.page = 1;
        loadScanTable();
      }, 350)
    );

    $('scanStatus').addEventListener('change', function (e) {
      state.scan.status = e.target.value;
      state.scan.page = 1;
      loadScanTable();
    });

    $('scanPerPage').addEventListener('change', function (e) {
      state.scan.perPage = Number(e.target.value);
      state.scan.page = 1;
      loadScanTable();
    });

    $('scanSelectAll').addEventListener('change', function (e) {
      state.scan.docs
        .filter(function (d) {
          return d.status === 'ready';
        })
        .forEach(function (d) {
          if (e.target.checked) state.selected.add(d.id);
          else state.selected.delete(d.id);
        });
      renderScanTable();
    });

    $('scanTbody').addEventListener('change', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-select');
      if (!id) return;
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
      renderScanTable();
    });

    $('scanTbody').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-scan]');
      if (!btn) return;
      loading(true);
      API.scanPdfUrl(btn.getAttribute('data-scan'))
        .catch(function (e2) {
          handleRequestError(e2, 'Scan failed');
        })
        .finally(function () {
          loading(false);
          reloadDocuments();
          loadScanTable();
        });
    });

    $('scanStartSelected').addEventListener('click', function () {
      startRemediation(false);
    });
  }

  function bindRemediatedTab() {
    $('remSearch').addEventListener(
      'input',
      debounce(function (e) {
        state.rem.search = e.target.value.trim();
        state.rem.page = 1;
        loadRemediatedTable();
      }, 350)
    );

    $('remSource').addEventListener('change', function (e) {
      state.rem.source = e.target.value;
      state.rem.page = 1;
      loadRemediatedTable();
    });

    $('remPerPage').addEventListener('change', function (e) {
      state.rem.perPage = Number(e.target.value);
      state.rem.page = 1;
      loadRemediatedTable();
    });

    $('remTbody').addEventListener('click', function (e) {
      var suggest = e.target.closest('[data-suggest]');
      if (suggest) {
        openSuggestions(suggest.getAttribute('data-suggest'));
        return;
      }
      var download = e.target.closest('[data-download]');
      if (!download) return;

      download.disabled = true;
      API.downloadRemediated(
        download.getAttribute('data-download'),
        download.getAttribute('data-name')
      ).then(function (ok) {
        download.disabled = false;
        if (!ok) toast('Could not download this file.', 'error');
      });
    });
  }

  function bindModals() {
    var confirmModal = $('confirmModal');
    confirmModal.addEventListener('click', function (e) {
      if (e.target.closest('[data-role="confirm"]')) {
        var action = state.confirm;
        closeConfirm();
        if (action) action();
      } else if (e.target.closest('[data-role="cancel"]') || e.target.closest('[data-role="close"]')) {
        closeConfirm();
      }
    });

    var sugModal = $('suggestionsModal');
    sugModal.addEventListener('click', function (e) {
      // Click the backdrop, or the close button, to dismiss.
      if (e.target === sugModal || e.target.closest('[data-role="close"]')) {
        show(sugModal, false);
      }
    });

    var partialModal = $('partialModal');
    partialModal.addEventListener('click', function (e) {
      if (e.target === partialModal) {
        closeCoverageModal();
        return;
      }
      if (e.target.closest('[data-role="upgrade"]')) {
        // Autologin link — signs the visitor into the accessibility dashboard
        // for this site and lands them on its PDF plans page. Opened in a new
        // tab so the workspace, and any selection in it, is left untouched.
        var target = API.upgradeUrl();
        if (target) {
          window.open(target, '_blank', 'noopener');
        } else {
          toast('Open the Plans page in the dashboard to upgrade.', 'info');
        }
        return;
      }
      if (e.target.closest('[data-role="continue"]')) {
        closeCoverageModal();
        startRemediation(true);
      }
    });
    partialModal.querySelector('[data-role="accept"]').addEventListener('change', function (e) {
      partialModal.querySelector('[data-role="continue"]').disabled = !e.target.checked;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeConfirm();
      closeCoverageModal();
      show($('suggestionsModal'), false);
    });
  }

  /* =================================================================== *
   * Boot
   * =================================================================== */
  /**
   * The tab to open on load. The host may name one (October's side menu links
   * carry `?tab=`), otherwise the URL is read directly so the standalone build
   * behaves the same. Falls back to Upload.
   */
  function initialTab() {
    var tabs = ['upload', 'scan', 'remediated'];
    var wanted = API.CONFIG.initialTab;

    if (!wanted) {
      try {
        wanted = new URLSearchParams(window.location.search).get('tab');
      } catch (e) {
        wanted = null;
      }
    }

    return tabs.indexOf(wanted) !== -1 ? wanted : 'upload';
  }

  function init() {
    // The host's settings may land after this file is parsed (October puts
    // these scripts in <head>), so apply them here before anything else.
    API.configure(window.AIOPDF_CONFIG);

    window.Icons.hydrate(document);
    API.adoptTokenFromQuery();

    bindTabs();
    bindUploadTab();
    bindScanTab();
    bindRemediatedTab();
    bindModals();

    // Plans are public and only feed the upgrade recommendation — a failure
    // here must not stop the tables from loading.
    API.fetchPlans()
      .then(function (plans) {
        state.plans = plans;
      })
      .catch(function () {
        state.plans = [];
      });

    // Sign in before the first table request, so nothing 401s on boot.
    loading(true);
    API.ensureSession()
      .then(function (ok) {
        if (!ok) {
          toast('Could not sign in — check the remediation service connection settings.', 'error');
        }
        return API.fetchMe();
      })
      .then(function (user) {
        state.user = user;
      })
      .catch(function () {
        state.user = null;
      })
      .finally(function () {
        loading(false);
        reloadDocuments();
        switchTab(initialTab());
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
