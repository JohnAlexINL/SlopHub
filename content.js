// === Function Prototypes ===
// void injectSlopscrollCSS()
// Promise<Array> fetchUserInterests(token)
// Promise<Array> fetchCurated(token, page)
// void renderFeed(repos, append)
// void addLoadMoreButton()
// void setupAutoLoadScroll()
// void handleAutoLoadScroll()
// void updateAutoLoadMoreSetting()
// HTMLDivElement createSlopscrollHeader()

let currentPage = 1;
let isLoading = false;
let githubToken = null;
let allRepos = [];
let userTopics = [];
let userLanguages = [];
let searchSeeds = [];
let searchSeedIndex = 0;
let autoLoadMore = false;

/**
 * Injects slopscroll.css as a <style> tag if not already injected
 */
function injectSlopscrollCSS() {
  if (document.getElementById('doomscroll-style')) return;
  fetch(chrome.runtime.getURL('slopscroll.css'))
    .then(resp => resp.text())
    .then(css => {
      const style = document.createElement('style');
      style.id = 'doomscroll-style';
      style.textContent = css;
      document.head.appendChild(style);
    });
}

/**
 * Fetch the authenticated user's starred repos and extract top topics/languages
 * @param {string} token
 * @returns {Promise<Array>}
 */
async function fetchUserInterests(token) {
  let starred = [];
  let page = 1;
  while (page <= 2) {
    const resp = await fetch(`https://api.github.com/user/starred?per_page=100&page=${page}`, {
      headers: { Authorization: `token ${token}` }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    starred = starred.concat(data);
    if (data.length < 100) break;
    page++;
  }
  const topicCount = {};
  const langCount = {};
  for (const repo of starred) {
    if (repo.topics && repo.topics.length) {
      repo.topics.forEach(topic => {
        topicCount[topic] = (topicCount[topic] || 0) + 1;
      });
    }
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
    }
  }
  userTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
  userLanguages = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
  searchSeeds = [];
  userTopics.forEach(t => searchSeeds.push({ type: 'topic', value: t }));
  userLanguages.forEach(l => searchSeeds.push({ type: 'language', value: l }));
  searchSeedIndex = 0;
  return searchSeeds;
}

/**
 * Search for repos related to one topic or language
 * @param {string} token
 * @param {number} page
 * @returns {Promise<Array>}
 */
async function fetchCurated(token, page = 1) {
  if (searchSeeds.length === 0) return [];
  const seed = searchSeeds[searchSeedIndex % searchSeeds.length];
  searchSeedIndex++;
  let q = "";
  if (seed.type === "topic") {
    q = `topic:${seed.value}`;
  } else {
    q = `language:${seed.value}`;
  }
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=20&page=${page}`;
  const resp = await fetch(url, {
    headers: { Authorization: `token ${token}` }
  });
  if (!resp.ok) throw new Error("API error");
  const data = await resp.json();
  return data.items || [];
}

/**
 * Create the header with GitHub logo and title for the doomscroll container
 * @returns {HTMLDivElement}
 */
function createSlopscrollHeader() {
  document.title = "SlopHub";
  const header = document.createElement("div");
  header.className = "doomscroll-header";
  // Use the locally packaged logo
  const logoUrl = chrome.runtime.getURL("github-mark-white.png");
  header.innerHTML = `
    <a href="https://github.com/JohnAlexINL/SlopHub">
    <img src="${logoUrl}" alt="GitHub Logo" class="doomscroll-github-logo" />
    <span class="doomscroll-title">SlopHub</span>
    <a class="doomscroll-dashboard" href="https://github.com/dashboard">Click here for the regular GitHub Dashboard</a>
    </a>
  `;
  return header;
}

/**
 * Renders repos. If append=true, adds to existing feed.
 * @param {Array} repos
 * @param {boolean} append
 */
function renderFeed(repos, append = false) {
  injectSlopscrollCSS();

  let container = document.querySelector('.doomscroll-container');
  let feed = document.querySelector('.doomscroll-feed');
  if (!container) {
    container = document.createElement("div");
    container.className = "doomscroll-container";
    container.innerHTML = `
      <div class="doomscroll-header-row"></div>
      <div class="doomscroll-feed"></div>
      <div class="doomscroll-load-more-row"></div>
    `;
    document.body.innerHTML = "";
    document.body.appendChild(container);
    // Insert the header with logo
    const headerRow = container.querySelector('.doomscroll-header-row');
    headerRow.appendChild(createSlopscrollHeader());
    feed = container.querySelector('.doomscroll-feed');
  }
  if (!append) feed.innerHTML = "";

  repos.forEach(repo => {
    const el = document.createElement("div");
    el.className = "doomscroll-repo";
    el.innerHTML = `
      <a href="${repo.html_url}" target="_blank" class="doomscroll-repo-link">${repo.full_name}</a>
      <span class="doomscroll-repo-stars">★${repo.stargazers_count}</span>
      <div class="doomscroll-repo-desc">${repo.description || ""}</div>`;
    feed.appendChild(el);
  });
  addLoadMoreButton();
  setupAutoLoadScroll();
}

/**
 * Adds or updates the Load More button at the bottom
 */
function addLoadMoreButton() {
  let row = document.querySelector('.doomscroll-load-more-row');
  if (!row) return;
  row.innerHTML = `<button class="doomscroll-load-more">Load more</button>`;
  const btn = row.querySelector('.doomscroll-load-more');
  btn.onclick = async () => {
    if (isLoading) return;
    isLoading = true;
    btn.disabled = true;
    btn.textContent = "Loading...";
    try {
      const moreRepos = await fetchCurated(githubToken, 1);
      allRepos = allRepos.concat(moreRepos);
      renderFeed(allRepos, true);
      btn.disabled = false;
      btn.textContent = "Load more";
    } catch {
      btn.textContent = "Error. Try again.";
    }
    isLoading = false;
  };
}

/**
 * Sets up (or removes) the scroll event handler for auto load more.
 * Should be called after each feed render.
 */
function setupAutoLoadScroll() {
  window.removeEventListener('scroll', handleAutoLoadScroll);
  if (autoLoadMore) {
    window.addEventListener('scroll', handleAutoLoadScroll);
  }
}

/**
 * Handles the scroll event to trigger loading more if near bottom.
 */
function handleAutoLoadScroll() {
  const btn = document.querySelector('.doomscroll-load-more');
  if (
    btn &&
    !btn.disabled &&
    (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 300)
  ) {
    btn.click();
  }
}

/**
 * Reads the user's setting for autoLoadMore and keeps autoLoadMore in sync.
 */
function updateAutoLoadMoreSetting() {
  chrome.storage.sync.get(['autoLoadMore'], result => {
    autoLoadMore = !!result.autoLoadMore;
    setupAutoLoadScroll();
  });

  chrome.storage.onChanged.addListener(changes => {
    if ('autoLoadMore' in changes) {
      autoLoadMore = !!changes.autoLoadMore.newValue;
      setupAutoLoadScroll();
    }
  });
}

// --- Main logic ---
if (
  window.location.hostname === "github.com" &&
  (window.location.pathname === "/" || window.location.pathname === "")
) {
  updateAutoLoadMoreSetting();
  chrome.storage.sync.get(['githubToken'], async (result) => {
    githubToken = result.githubToken;
    if (!githubToken) return;
    try {
      currentPage = 1;
      isLoading = false;
      allRepos = [];
      await fetchUserInterests(githubToken);
      if (searchSeeds.length === 0) {
        document.body.innerHTML = `<div class="doomscroll-empty-message">No topics or languages found in your starred repos.<br>Star some repositories to get curation!</div>`;
        injectSlopscrollCSS();
        return;
      }
      const repos = await fetchCurated(githubToken, 1);
      allRepos = repos;
      renderFeed(repos, false);
    } catch (e) {
      document.body.innerHTML = `<div class="doomscroll-error-message">GitHub API error. Try a new token.</div>`;
      injectSlopscrollCSS();
    }
  });
}