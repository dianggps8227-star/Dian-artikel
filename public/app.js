'use strict';

// ===============================
// RUANG ARTIKEL - APP.JS
// ===============================

const state = {
  articles: [],
  user: null,
  bookmarks: [],
  category: 'Semua',
  query: '',
  sort: 'latest',
  page: 1,
  pageSize: 6,
  currentArticleId: null,
  editingId: null,
  bookmarksOnly: false,
  registerMode: false,
  autosaveTimer: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const views = {
  home: $('#homeView'),
  admin: $('#adminView'),
  reader: $('#readerView')
};

// ===============================
// NAVIGASI
// ===============================

function setView(name) {
  if (!views[name]) return;

  Object.values(views).forEach(view => {
    view?.classList.add('hidden');
  });

  views[name].classList.remove('hidden');

  $$('.main-nav .nav-link').forEach(btn => {
    btn.classList.remove('active');
  });

  if (name === 'home') $('#homeNav')?.classList.add('active');
  if (name === 'admin') $('#adminNav')?.classList.add('active');

  $('.main-nav')?.classList.remove('open');

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// ===============================
// UTILITAS
// ===============================

function escapeHTML(text = '') {
  return String(text).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function formatDate(date) {
  const d = new Date(date);

  if (isNaN(d)) return 'Baru saja';

  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function timeAgo(date) {
  const days = Math.floor(
    (Date.now() - new Date(date).getTime()) / 86400000
  );

  if (isNaN(days) || days <= 0) return 'Hari ini';
  if (days === 1) return 'Kemarin';
  if (days < 7) return days + ' hari lalu';

  return formatDate(date);
}

function readMinutes(content) {
  const words = String(content || '')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 200));
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

// ===============================
// API SERVER
// ===============================

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || result.message || 'Permintaan gagal.');
  }

  return result;
}

// ===============================
// ARTIKEL
// ===============================

function publishedArticles() {
  return state.articles.filter(article =>
    article.status === 'published'
  );
}

function getVisibleArticles() {
  let list = publishedArticles();

  if (state.category !== 'Semua') {
    list = list.filter(article =>
      article.category === state.category
    );
  }

  if (state.bookmarksOnly) {
    list = list.filter(article =>
      state.bookmarks.includes(article.id)
    );
  }

  if (state.query) {
    const q = state.query.toLowerCase();

    list = list.filter(article => {
      const text = [
        article.title,
        article.excerpt,
        article.category,
        ...(article.tags || [])
      ].join(' ').toLowerCase();

      return text.includes(q);
    });
  }

  if (state.sort === 'popular') {
    list.sort((a, b) =>
      (Number(b.reads) + Number(b.likes)) -
      (Number(a.reads) + Number(a.likes))
    );
  } else if (state.sort === 'oldest') {
    list.sort((a, b) =>
      new Date(a.createdAt) - new Date(b.createdAt)
    );
  } else {
    list.sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  return list;
}

// ===============================
// FILTER KATEGORI
// ===============================

function renderFilters() {
  const categories = [
    'Semua',
    ...new Set(
      publishedArticles()
        .map(article => article.category)
        .filter(Boolean)
    )
  ];

  const container = $('#categoryFilters');
  if (!container) return;

  container.innerHTML = categories.map(category => `
    <button
      type="button"
      class="filter-chip ${state.category === category ? 'active' : ''}"
      data-category="${escapeHTML(category)}">
      ${escapeHTML(category)}
    </button>
  `).join('');
}

// ===============================
// COVER ARTIKEL
// ===============================

function cardCover(article) {
  const cover = article.cover || '';

  if (cover.startsWith('https://') ||
      cover.startsWith('/uploads/')) {
    return `
      <div class="card-cover">
        <img src="${escapeHTML(cover)}"
             alt="Cover artikel"
             loading="lazy">
        <span class="card-category">
          ${escapeHTML(article.category || 'Umum')}
        </span>
      </div>
    `;
  }

  return `
    <div class="card-cover">
      <div class="cover-placeholder">
        <span class="cover-glyph">
          ${escapeHTML((article.category || 'R').charAt(0))}
        </span>
      </div>
      <span class="card-category">
        ${escapeHTML(article.category || 'Umum')}
      </span>
    </div>
  `;
}

// ===============================
// RENDER DAFTAR ARTIKEL
// ===============================

function renderFeed() {
  const grid = $('#articleGrid');
  if (!grid) return;

  const articles = getVisibleArticles();

  const totalPages = Math.max(
    1,
    Math.ceil(articles.length / state.pageSize)
  );

  state.page = Math.min(state.page, totalPages);

  const start = (state.page - 1) * state.pageSize;

  const visible = articles.slice(
    start,
    start + state.pageSize
  );

  $('#resultCount').textContent =
    `${articles.length} artikel ditemukan`;

  if (!visible.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <strong>Artikel belum tersedia</strong>
        <p>Coba kata kunci atau kategori lainnya.</p>
      </div>
    `;
  } else {
    grid.innerHTML = visible.map(article => `
      <article class="article-card"
        tabindex="0"
        role="button"
        data-open="${escapeHTML(article.id)}">

        ${cardCover(article)}

        <div class="card-content">
          <div class="card-date">
            ${escapeHTML(timeAgo(article.createdAt))}
            · ${readMinutes(article.content)} menit baca
          </div>

          <h3 class="card-title">
            ${escapeHTML(article.title)}
          </h3>

          <p class="card-excerpt">
            ${escapeHTML(article.excerpt || '')}
          </p>

          <div class="card-bottom">
            <span class="card-author">
              ${escapeHTML(article.author || 'Penulis')}
            </span>

            <span class="card-metrics">
              ♡ ${Number(article.likes) || 0}
              ·
              ◉ ${Number(article.reads) || 0}
            </span>
          </div>
        </div>
      </article>
    `).join('');
  }

  // Pagination
  $('#pagination').innerHTML = totalPages > 1 ? `
    <button data-page="prev" ${state.page === 1 ? 'disabled' : ''}>
      ←
    </button>

    <span>Halaman ${state.page} / ${totalPages}</span>

    <button data-page="next"
      ${state.page === totalPages ? 'disabled' : ''}>
      →
    </button>
  ` : '';

  // Tombol bookmark
  $('#bookmarksToggle').textContent =
    state.bookmarksOnly
      ? '← Semua Artikel'
      : '☆ Artikel Tersimpan';

  // Artikel populer
  const popular = [...publishedArticles()]
    .sort((a, b) => (Number(b.reads) || 0) -
                     (Number(a.reads) || 0)
    )
    .slice(0, 3);

  $('#popularList').innerHTML = popular.length
    ? popular.map((article, index) => `
        <button class="popular-item"
          type="button"
          data-open="${escapeHTML(article.id)}">

          <span class="popular-number">0${index + 1}</span>

          <span>
            <strong>${escapeHTML(article.title)}</strong>
            <small>${Number(article.reads) || 0} kali dibaca</small>
          </span>
        </button>
      `).join('')
    : '<p>Belum ada artikel populer.</p>';
}

function renderAll() {
  renderFilters();
  renderFeed();
  renderStats();
  renderManageList();
}
// ===============================
// STATISTIK ADMIN
// ===============================

function renderStats() {
  $('#statTotal').textContent = state.articles.length;

  $('#statPublished').textContent =
    state.articles.filter(a => a.status === 'published').length;

  $('#statDraft').textContent =
    state.articles.filter(a => a.status === 'draft').length;

  $('#statLikes').textContent =
    state.articles.reduce((sum, a) => sum + (Number(a.likes) || 0), 0);

  $('#statReads').textContent =
    state.articles.reduce((sum, a) => sum + (Number(a.reads) || 0), 0);

  const top = [...publishedArticles()]
    .sort((a, b) => (b.reads || 0) - (a.reads || 0))[0];

  $('#topArticleTitle').textContent =
    top ? top.title : 'Belum ada artikel';

  $('#topArticleInfo').textContent =
    top ? `${top.reads || 0} kali dibaca` : 'Belum tersedia';

  $('#manageCount').textContent =
    state.articles.length + ' artikel';
}

// ===============================
// LIST KELOLA ARTIKEL
// ===============================

function renderManageList() {
  const list = state.articles.filter(article =>
    state.user &&
    (state.user.role === 'admin' || article.ownerId === state.user.id)
  );

  $('#manageList').innerHTML = list.length
    ? list.map(article => `
      <div class="manage-row">
        <div class="manage-title">
          <strong>${escapeHTML(article.title)}</strong>
          <small>
            ${escapeHTML(article.category || 'Umum')}
            · ${escapeHTML(formatDate(article.updatedAt || article.createdAt))}
          </small>
        </div>

        <span class="status-pill ${article.status}">
          ${article.status === 'published' ? 'Terbit' : 'Draf'}
        </span>

        <div class="manage-actions">
          <button class="small-action"
            data-edit="${escapeHTML(article.id)}">
            Edit
          </button>

          <button class="small-action delete"
            data-delete="${escapeHTML(article.id)}">
            Hapus
          </button>
        </div>
      </div>
    `).join('')
    : `
      <div class="empty-state">
        <strong>Belum ada artikel</strong>
        <p>Buat tulisan pertamamu.</p>
      </div>
    `;
}

// ===============================
// LOAD ARTIKEL DARI SERVER
// ===============================

async function loadArticles() {
  try {
    const result = await api('/api/articles');

    state.articles = Array.isArray(result)
      ? result
      : (result.articles || []);

    renderAll();
  } catch (error) {
    $('#articleGrid').innerHTML = `
      <div class="empty-state">
        <strong>Gagal memuat artikel</strong>
        <p>${escapeHTML(error.message)}</p>
      </div>
    `;

    console.error('Load artikel:', error);
  }
}

// ===============================
// LOGIN / SESSION
// ===============================

async function refreshAuth() {
  try {
    const result = await api('/api/auth/me');

    state.user = result.user || null;

    if (state.user) {
      state.bookmarks = await api('/api/bookmarks')
        .catch(() => []);
    } else {
      state.bookmarks = [];
    }
  } catch {
    state.user = null;
    state.bookmarks = [];
  }

  updateAccountUI();
}

function updateAccountUI() {
  const loggedIn = Boolean(state.user);
  const isAdmin = loggedIn && state.user.role === 'admin';

  $('#accountLabel').textContent = loggedIn
    ? state.user.username
    : 'Belum login';

  $('#adminNav').textContent = loggedIn
    ? 'Kelola Artikel'
    : 'Login untuk menulis';

  $('#moderationPanel')?.classList.toggle('hidden', !isAdmin);
  $('#logoutBtn')?.classList.toggle('hidden', !loggedIn);

  $('#accountHeading').textContent =
    state.registerMode ? 'Daftar Akun' : 'Login';

  $('#accountSubmit').textContent =
    state.registerMode ? 'Daftar' : 'Login';

  $('#registerToggle').textContent =
    state.registerMode
      ? 'Sudah punya akun? Login'
      : 'Belum punya akun? Daftar';

  $('#registerToggle')?.classList.toggle('hidden', loggedIn);
  $('#accountForm')?.classList.toggle('hidden', loggedIn);
}

// ===============================
// AUTO SAVE EDITOR
// ===============================

function readAutosave() {
  try {
    return JSON.parse(
      localStorage.getItem('ruangArtikelAutosave') || 'null'
    );
  } catch {
    return null;
  }
}

function saveAutosave() {
  clearTimeout(state.autosaveTimer);

  $('#saveHint').textContent = 'Menyimpan draf...';

  state.autosaveTimer = setTimeout(() => {
    const data = {
      editingId: state.editingId,
      title: $('#articleTitle').value,
      category: $('#articleCategory').value,
      cover: $('#articleCover').value,
      excerpt: $('#articleExcerpt').value,
      tags: $('#articleTags').value,
      content: $('#articleContent').innerHTML
    };

    try {
      localStorage.setItem(
        'ruangArtikelAutosave',
        JSON.stringify(data)
      );

      $('#saveHint').textContent = 'Draf otomatis tersimpan.';
    } catch {
      $('#saveHint').textContent = 'Gagal menyimpan draf otomatis.';
    }
  }, 500);
}

// ===============================
// COVER PREVIEW
// ===============================

function setCoverPreview(src) {
  if (!src) return clearCoverPreview();

  $('#coverPreviewImg').src = src;
  $('#coverPreview').classList.remove('hidden');
}

function clearCoverPreview() {
  $('#coverPreview')?.classList.add('hidden');

  const img = $('#coverPreviewImg');

  if (img) img.removeAttribute('src');
}

// ===============================
// HITUNG KATA
// ===============================

function updateWordCount() {
  const content = $('#articleContent')?.innerText.trim() || '';
  const count = content
    ? content.split(/\s+/).filter(Boolean).length
    : 0;

  $('#wordCount').textContent = count + ' kata';
}

// ===============================
// BUKA EDITOR
// ===============================

function openEditor(article = null) {
  if (!state.user) {
    $('#accountModal').classList.remove('hidden');
    return;
  }

  state.editingId = article ? article.id : null;

  $('#editorHeading').textContent =
    article ? 'Edit Artikel' : 'Artikel Baru';

  $('#articleTitle').value = article?.title || '';
  $('#articleCategory').value = article?.category || 'Umum';
  $('#articleCover').value = article?.cover || '';
  $('#articleExcerpt').value = article?.excerpt || '';
  $('#articleTags').value = (article?.tags || []).join(', ');
  $('#articleContent').innerHTML = article?.content || '';

  clearCoverPreview();

  const saved = readAutosave();

  if (saved && saved.editingId === state.editingId) {
    $('#articleTitle').value = saved.title || '';
    $('#articleCategory').value = saved.category || 'Umum';
    $('#articleCover').value = saved.cover || '';
    $('#articleExcerpt').value = saved.excerpt || '';
    $('#articleTags').value = saved.tags || '';
    $('#articleContent').innerHTML = saved.content || '';

    $('#saveHint').textContent = 'Draf dipulihkan.';
  } else if (article?.cover) {
    setCoverPreview(article.cover);
  }

  updateWordCount();

  $('#editorPanel').classList.add('open');

  setView('admin');

  $('#editorPanel').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

// ===============================
// TUTUP EDITOR
// ===============================

function closeEditor() {
  $('#editorPanel')?.classList.remove('open');

  state.editingId = null;

  $('#articleForm')?.reset();
  $('#articleContent').innerHTML = '';

  updateWordCount();
}

// ===============================
// SANITASI HTML
// ===============================

function cleanContent(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  const allowed = [
    'P', 'BR', 'H2', 'H3', 'STRONG', 'B',
    'EM', 'I', 'U', 'UL', 'OL', 'LI',
    'BLOCKQUOTE', 'A', 'IMG'
  ];

  template.content.querySelectorAll('*').forEach(el => {
    if (!allowed.includes(el.tagName)) {
      el.replaceWith(...el.childNodes);
      return;
    }

    [...el.attributes].forEach(attr => {
      if (attr.name !== 'href' && attr.name !== 'src' && attr.name !== 'alt') {
        el.removeAttribute(attr.name);
      }
    });

    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';

      if (!href.startsWith('https://')) {
        el.removeAttribute('href');
      } else {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || '';

      if (!src.startsWith('https://') && !src.startsWith('/uploads/')) {
        el.remove();
      }
    }
  });

  return template.innerHTML;
}

// ===============================
// SIMPAN / TERBITKAN
// ===============================

async function saveArticle(status) {
  const title = $('#articleTitle').value.trim();
  const content = cleanContent($('#articleContent').innerHTML);

  if (!title) {
    showToast('Judul belum diisi.');
    return;
  }

  if (!content.trim()) {
    showToast('Isi artikel belum ditulis.');
    return;
  }

  const payload = {
    title,
    category: $('#articleCategory').value,
    cover: $('#articleCover').value.trim(),
    excerpt: $('#articleExcerpt').value.trim(),
    tags: $('#articleTags').value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
    content,
    status
  };

  try {
    if (state.editingId) {
      await api('/api/articles/' + encodeURIComponent(state.editingId), {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await api('/api/articles', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    await loadArticles();

    localStorage.removeItem('ruangArtikelAutosave');

    closeEditor();
    setView('admin');

    showToast(
      status === 'published'
        ? 'Artikel berhasil diterbitkan!'
        : 'Draf berhasil disimpan!'
    );
  } catch (error) {
    showToast(error.message);
  }
}
// ===============================
// BACA ARTIKEL
// ===============================

async function openArticle(id) {
  const article = state.articles.find(a => String(a.id) === String(id));

  if (!article || article.status !== 'published') return;

  state.currentArticleId = id;

  try {
    await api(`/api/articles/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      body: '{}'
    });

    await loadArticles();
  } catch (e) {
    console.warn(e);
  }

  renderReader();
  setView('reader');
}

function renderReader() {
  const article = state.articles.find(
    a => String(a.id) === String(state.currentArticleId)
  );

  if (!article) {
    setView('home');
    return;
  }

  const comments = article.comments || [];

  $('#readerArticle').innerHTML = `
    <div class="reader-body">
      <span class="reader-category">
        ${escapeHTML(article.category || 'Umum')}
      </span>

      <h1 class="reader-title">
        ${escapeHTML(article.title)}
      </h1>

      <div class="reader-meta">
        <span>${escapeHTML(article.author || 'Penulis')}</span>
        <span>${escapeHTML(formatDate(article.createdAt))}</span>
        <span>${article.reads || 0} dibaca</span>
      </div>

      ${article.cover ? `
        <img class="reader-cover"
          src="${escapeHTML(article.cover)}"
          alt="Cover artikel">
      ` : ''}

      ${article.excerpt ? `
        <p class="reader-excerpt">
          ${escapeHTML(article.excerpt)}
        </p>
      ` : ''}

      <div class="reader-content">
        ${article.content || ''}
      </div>

      <div class="reader-tags">
        ${(article.tags || []).map(tag =>
          `<span>#${escapeHTML(tag)}</span>`
        ).join('')}
      </div>

      <div class="reader-actions">
        <button id="likeArticleBtn" class="like-btn">
          ♡ Suka (${article.likes || 0})
        </button>

        <button id="bookmarkArticleBtn" class="like-btn">
          ${state.bookmarks.includes(article.id)
            ? '★ Tersimpan'
            : '☆ Bookmark'}
        </button>

        <button id="shareArticleBtn" class="like-btn">
          ↗ Bagikan
        </button>
      </div>

      <section class="comments-section">
        <h3>Diskusi (${comments.length})</h3>

        <form id="commentForm" class="comment-form">
          <input id="commentName"
            placeholder="Nama kamu"
            maxlength="40"
            required>

          <input id="commentText"
            placeholder="Tulis komentar..."
            maxlength="500"
            required>

          <button type="submit">Kirim</button>
        </form>

        <div id="commentsList">
          ${comments.length
            ? comments.slice().reverse().map(comment => `
              <div class="comment-item">
                <strong>${escapeHTML(comment.author)}</strong>
                <small>${escapeHTML(formatDate(comment.createdAt))}</small>
                <p>${escapeHTML(comment.text)}</p>
              </div>
            `).join('')
            : '<p class="no-comments">Belum ada komentar.</p>'
          }
        </div>
      </section>
    </div>
  `;

  $('#likeArticleBtn').onclick = likeCurrentArticle;
  $('#bookmarkArticleBtn').onclick = toggleBookmarkCurrent;
  $('#shareArticleBtn').onclick = shareCurrentArticle;
  $('#commentForm').onsubmit = submitComment;
}

// ===============================
// LIKE
// ===============================

async function likeCurrentArticle() {
  try {
    await api(
      `/api/articles/${encodeURIComponent(state.currentArticleId)}/like`,
      {
        method: 'POST',
        body: '{}'
      }
    );

    await loadArticles();
    renderReader();

    showToast('Terima kasih sudah menyukai artikel!');
  } catch (error) {
    showToast(error.message);
  }
}

// ===============================
// KOMENTAR
// ===============================

async function submitComment(event) {
  event.preventDefault();

  const author = $('#commentName').value.trim();
  const text = $('#commentText').value.trim();

  if (!author || !text) {
    showToast('Nama dan komentar wajib diisi.');
    return;
  }

  try {
    await api(
      `/api/articles/${encodeURIComponent(state.currentArticleId)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ author, text })
      }
    );

    await loadArticles();
    renderReader();

    showToast('Komentar berhasil dikirim!');
  } catch (error) {
    showToast(error.message);
  }
}

// ===============================
// BOOKMARK
// ===============================

async function toggleBookmarkCurrent() {
  if (!state.user) {
    showToast('Login terlebih dahulu.');
    return;
  }

  try {
    const result = await api(
      `/api/bookmarks/${encodeURIComponent(state.currentArticleId)}`,
      {
        method: 'POST',
        body: '{}'
      }
    );

    if (result.bookmarked) {
      if (!state.bookmarks.includes(state.currentArticleId)) {
        state.bookmarks.push(state.currentArticleId);
      }
    } else {
      state.bookmarks = state.bookmarks.filter(
        id => id !== state.currentArticleId
      );
    }

    renderReader();
    renderFeed();

    showToast(
      result.bookmarked
        ? 'Artikel disimpan!'
        : 'Bookmark dihapus.'
    );
  } catch (error) {
    showToast(error.message);
  }
}

// ===============================
// BAGIKAN ARTIKEL
// ===============================

async function shareCurrentArticle() {
  const article = state.articles.find(
    a => String(a.id) === String(state.currentArticleId)
  );

  if (!article) return;

  const url = location.origin + location.pathname +
    '?article=' + encodeURIComponent(article.id);

  try {
    if (navigator.share) {
      await navigator.share({
        title: article.title,
        text: article.excerpt || article.title,
        url
      });
    } else {
      await navigator.clipboard.writeText(url);
      showToast('Link berhasil disalin!');
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      showToast('Gagal membagikan artikel.');
    }
  }
}

// ===============================
// HAPUS ARTIKEL
// ===============================

async function deleteArticle(id) {
  const article = state.articles.find(
    a => String(a.id) === String(id)
  );

  if (!article) return;

  if (!confirm(`Hapus artikel "${article.title}"?`)) return;

  try {
    await api('/api/articles/' + encodeURIComponent(id), {
      method: 'DELETE'
    });

    await loadArticles();
    showToast('Artikel berhasil dihapus.');
  } catch (error) {
    showToast(error.message);
  }
}

// ===============================
// UPLOAD GAMBAR
// ===============================

async function uploadImage(file, isCover) {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('File harus berupa gambar.');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('Maksimal ukuran gambar 2 MB.');
    return;
  }

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const result = await api('/api/upload', {
        method: 'POST',
        body: JSON.stringify({
          data: reader.result
        })
      });

      if (isCover) {
        $('#articleCover').value = result.url;
        setCoverPreview(result.url);
      } else {
        $('#articleContent').focus();

        document.execCommand(
          'insertImage',
          false,
          result.url
        );

        updateWordCount();
      }

      saveAutosave();
      showToast('Upload gambar berhasil!');
    } catch (error) {
      showToast('Upload gagal: ' + error.message);
    }
  };

  reader.readAsDataURL(file);
}

// ===============================
// MODERASI KOMENTAR (ADMIN)
// ===============================

async function refreshModeration() {
  if (!state.user || state.user.role !== 'admin') return;

  try {
    const result = await api('/api/moderation/comments');
    const pending = Array.isArray(result)
      ? result
      : result.comments || [];

    $('#moderationList').innerHTML = pending.length
      ? pending.map(item => `
          <div class="moderation-item">
            <p>
              <strong>${escapeHTML(item.comment.author)}</strong>
              · ${escapeHTML(item.articleTitle)}
            </p>

            <p>${escapeHTML(item.comment.text)}</p>

            <button data-moderate="approve"
              data-article="${escapeHTML(item.articleId)}"
              data-comment="${escapeHTML(item.comment.id)}">
              Setujui
            </button>

            <button data-moderate="delete"
              data-article="${escapeHTML(item.articleId)}"
              data-comment="${escapeHTML(item.comment.id)}">
              Hapus
            </button>
          </div>
        `).join('')
      : '<p>Tidak ada komentar pending.</p>';
  } catch (error) {
    $('#moderationList').textContent =
      'Gagal memuat moderasi.';
  }
}

// ===============================
// TEMA
// ===============================

function applyTheme() {
  const dark = localStorage.getItem('artikel-theme') === 'dark';

  document.body.classList.toggle('dark', dark);

  $('#themeBtn').setAttribute(
    'aria-label',
    dark ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'
  );
}

// ===============================
// EVENT SEMUA TOMBOL
// ===============================

function initEvents() {

  // Navigasi
  $('#homeNav').onclick = () => {
    closeEditor();
    setView('home');
  };

  $('#brandHome').onclick = event => {
    event.preventDefault();
    closeEditor();
    setView('home');
  };

  $('.footer-brand').onclick = event => {
    event.preventDefault();
    closeEditor();
    setView('home');
  };

  $('#adminNav').onclick = () => {
    if (!state.user) {
      $('#accountModal').classList.remove('hidden');
      return;
    }

    setView('admin');
    renderAll();
    refreshModeration();
  };

  // Tombol menulis
  [
    'newArticleTop',
    'heroWrite',
    'aboutWrite',
    'newArticleAdmin'
  ].forEach(id => {
    const button = $('#' + id);
    if (!button) return;

    button.onclick = () => openEditor();
  });

  $('#closeEditor').onclick = closeEditor;
  $('#backToHome').onclick = () => setView('home');

  $('#mobileMenu').onclick = () => {
    $('.main-nav').classList.toggle('open');
  };

  // Pencarian
  $('#searchInput').oninput = event => {
    state.query = event.target.value;
    state.page = 1;
    renderFeed();
  };

  // Sorting
  $('#sortSelect').onchange = event => {
    state.sort = event.target.value;
    state.page = 1;
    renderFeed();
  };

  // Kategori
  $('#categoryFilters').onclick = event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;

    state.category = button.dataset.category;
    state.page = 1;

    renderFilters();
    renderFeed();
  };

  // Klik artikel
  $('#articleGrid').onclick = event => {
    const card = event.target.closest('[data-open]');
    if (card) openArticle(card.dataset.open);
  };

  $('#popularList').onclick = event => {
    const button = event.target.closest('[data-open]');
    if (button) openArticle(button.dataset.open);
  };

  // Pagination
  $('#pagination').onclick = event => {
    const button = event.target.closest('[data-page]');
    if (!button) return;

    state.page += button.dataset.page === 'next' ? 1 : -1;
    renderFeed();
  };

  // Bookmark filter
  $('#bookmarksToggle').onclick = () => {
    if (!state.user) {
      showToast('Login untuk melihat bookmark.');
      return;
    }

    state.bookmarksOnly = !state.bookmarksOnly;
    state.page = 1;
    renderFeed();
  };

  // Edit dan hapus
  $('#manageList').onclick = event => {
    const edit = event.target.closest('[data-edit]');
    const del = event.target.closest('[data-delete]');

    if (edit) {
      const article = state.articles.find(
        a => String(a.id) === String(edit.dataset.edit)
      );

      if (article) openEditor(article);
    }

    if (del) deleteArticle(del.dataset.delete);
  };

  // Toolbar editor
  $$('.editor-toolbar [data-command]').forEach(button => {
    button.onclick = () => {
      $('#articleContent').focus();

      document.execCommand(
        button.dataset.command,
        false,
        button.dataset.value || null
      );

      updateWordCount();
      saveAutosave();
    };
  });

  // Link di artikel
  $('#insertLinkBtn').onclick = () => {
    const url = prompt('Masukkan link HTTPS:');

    if (!url) return;

    if (!url.trim().startsWith('https://')) {
      showToast('URL harus menggunakan HTTPS.');
      return;
    }

    $('#articleContent').focus();
    document.execCommand('createLink', false, url.trim());
  };

  // Auto-save
  $('#articleContent').oninput = () => {
    updateWordCount();
    saveAutosave();
  };

  [
    'articleTitle',
    'articleCategory',
    'articleCover',
    'articleExcerpt',
    'articleTags'
  ].forEach(id => {
    $('#' + id).oninput = saveAutosave;
  });

  // Upload cover
  $('#coverUpload').onchange = event => {
    uploadImage(event.target.files[0], true);
  };

  $('#articleCover').oninput = () => {
    if ($('#articleCover').value.trim()) {
      setCoverPreview($('#articleCover').value.trim());
    }
  };

  $('#removeCover').onclick = () => {
    $('#articleCover').value = '';
    clearCoverPreview();
    saveAutosave();
  };

  // Upload gambar dalam isi artikel
  $('#insertImageBtn').onclick = () => {
    $('#inlineImageUpload').click();
  };

  $('#inlineImageUpload').onchange = event => {
    uploadImage(event.target.files[0], false);
    event.target.value = '';
  };

  // Simpan draf / terbitkan
  $('#saveDraftBtn').onclick = () => saveArticle('draft');
  $('#publishBtn').onclick = () => saveArticle('published');

  $('#articleForm').onsubmit = event => {
    event.preventDefault();
  };

  // Akun
  $('#accountBtn').onclick = () => {
    $('#accountModal').classList.remove('hidden');
  };

  $('#accountClose').onclick = () => {
    $('#accountModal').classList.add('hidden');
  };

  $('#registerToggle').onclick = () => {
    state.registerMode = !state.registerMode;
    updateAccountUI();
  };

  // Login dan register
  $('#accountForm').onsubmit = async event => {
    event.preventDefault();

    try {
      const result = await api(
        state.registerMode
          ? '/api/auth/register'
          : '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            username: $('#accountUsername').value.trim(),
            password: $('#accountPassword').value
          })
        }
      );

      state.user = result.user;

      state.bookmarks = await api('/api/bookmarks')
        .catch(() => []);

      $('#accountModal').classList.add('hidden');
      $('#accountPassword').value = '';

      updateAccountUI();
      await loadArticles();

      showToast(
        result.firstAdmin
          ? 'Admin pertama berhasil dibuat!'
          : 'Login berhasil!'
      );
    } catch (error) {
      showToast(error.message);
    }
  };

  // Logout
  $('#logoutBtn').onclick = async () => {
    try {
      await api('/api/auth/logout', {
        method: 'POST',
        body: '{}'
      });
    } catch {}

    state.user = null;
    state.bookmarks = [];

    updateAccountUI();
    await loadArticles();

    $('#accountModal').classList.add('hidden');
    showToast('Logout berhasil.');
  };

  // Moderasi
  $('#moderationList').onclick = async event => {
    const button = event.target.closest('[data-moderate]');
    if (!button) return;

    try {
      await api(
        `/api/moderation/comments/${button.dataset.article}/${button.dataset.comment}`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: button.dataset.moderate
          })
        }
      );

      await refreshModeration();
      await loadArticles();

      showToast('Moderasi diperbarui.');
    } catch (error) {
      showToast(error.message);
    }
  };

  // Tema
  $('#themeBtn').onclick = () => {
    const next = document.body.classList.contains('dark')
      ? 'light'
      : 'dark';

    localStorage.setItem('artikel-theme', next);
    applyTheme();
  };
}

// ===============================
// START APLIKASI
// ===============================

async function boot() {
  initEvents();

  $('#yearNow').textContent = new Date().getFullYear();

  applyTheme();

  await refreshAuth();
  await loadArticles();

  // Buka artikel via URL
  const articleId = new URLSearchParams(location.search)
    .get('article');

  if (articleId) {
    openArticle(articleId);
  }
}

document.addEventListener('DOMContentLoaded', boot);
