// === Function Prototypes ===
// void initPopup()
// void setupTokenInput()
// void setupAutoLoadToggle()

document.addEventListener('DOMContentLoaded', initPopup);

function initPopup() {
  setupTokenInput();
  setupAutoLoadToggle();
}

function setupTokenInput() {
  const tokenInput = /** @type {HTMLInputElement} */ (document.getElementById('token-input'));
  const status = document.getElementById('status');
  const saveBtn = document.getElementById('save-token');

  chrome.storage.sync.get(['githubToken'], ({ githubToken }) => {
    if (githubToken) tokenInput.value = githubToken;
  });

  saveBtn.onclick = () => {
    const token = tokenInput.value.trim();
    if (token.length < 10) {
      status.textContent = "Invalid token.";
      return;
    }
    chrome.storage.sync.set({ githubToken: token }, () => {
      status.textContent = "Token saved!";
      setTimeout(() => status.textContent = "", 1200);
    });
  };
}

function setupAutoLoadToggle() {
  const toggle = /** @type {HTMLInputElement} */ (document.getElementById('autoLoadToggle'));

  chrome.storage.sync.get(['autoLoadMore'], result => {
    toggle.checked = !!result.autoLoadMore;
  });

  toggle.addEventListener('change', function() {
    chrome.storage.sync.set({ autoLoadMore: toggle.checked });
  });
}