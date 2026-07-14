// =======================================================
// Interview Helper Preview
// =======================================================

let manifest = null;
let questions = [];
let filteredQuestions = [];
let selectedCategory = null;
let selectedGroup = null;
let autoReloadTimer = null;

const searchInput     = document.getElementById("searchInput");
const clearSearch     = document.getElementById("clearSearch");
const reloadBtn       = document.getElementById("reloadBtn");
const reloadAge       = document.getElementById("reloadAge");
const questionList    = document.getElementById("questionList");
const questionCount   = document.getElementById("questionCount");
const filteredCount   = document.getElementById("filteredCount");
const currentCategory = document.getElementById("currentCategory");
const groupTabs       = document.getElementById("groupTabs");
const categoryList    = document.getElementById("categoryList");

// =======================================================
// Init
// =======================================================

document.addEventListener("DOMContentLoaded", async () => {
  await loadManifest();
  bindEvents();

  if (CONFIG.autoReload) {
    autoReloadTimer = setInterval(() => {
      reloadCurrentCategory();
    }, CONFIG.reloadInterval);
  }
});

// =======================================================
// Load Manifest
// =======================================================

async function loadManifest() {
  try {
    const response = await fetch(CONFIG.manifest + "?t=" + Date.now());
    manifest = await response.json();
    buildSidebar();
  } catch (e) {
    console.error(e);
    questionList.innerHTML = '<div class="loading"><p>Unable to load manifest.json</p></div>';
  }
}

// =======================================================
// Build Sidebar
// =======================================================

function buildSidebar() {
  const savedCategory = localStorage.getItem("preview-selected-category");
  const savedGroup    = localStorage.getItem("preview-selected-group");

  const savedCategoryObj = savedCategory && manifest.categories.find(c => c.file === savedCategory);
  const firstGroup = manifest.groups && manifest.groups[0] ? manifest.groups[0].id : null;

  selectedGroup = savedCategoryObj
    ? savedCategoryObj.group
    : (savedGroup || firstGroup);

  // Build group tabs
  groupTabs.innerHTML = "";
  (manifest.groups || []).forEach(function(group) {
    const btn = document.createElement("button");
    btn.className = "group-tab" + (group.id === selectedGroup ? " active" : "");
    btn.dataset.groupId = group.id;
    btn.textContent = group.label;
    if (group.color) btn.style.setProperty("--group-color", group.color);
    groupTabs.appendChild(btn);
  });

  renderCategoryList(savedCategory);
}

function renderCategoryList(preferFile) {
  categoryList.innerHTML = "";

  const groupCategories = manifest.categories.filter(function(c) { return c.group === selectedGroup; });
  const preferred = preferFile && groupCategories.find(function(c) { return c.file === preferFile; });
  const toSelect  = preferred || groupCategories[0];

  if (!toSelect) return;

  groupCategories.forEach(function(cat) {
    const btn = document.createElement("button");
    btn.className = "category-item" + (cat.file === toSelect.file ? " active" : "");
    btn.dataset.file = cat.file;
    btn.innerHTML = '<span class="cat-label">' + cat.label + '</span><span class="cat-count">' + cat.count + '</span>';
    if (cat.color) btn.style.setProperty("--cat-color", cat.color);
    categoryList.appendChild(btn);
  });

  selectedCategory = toSelect;
  localStorage.setItem("preview-selected-category", toSelect.file);
  localStorage.setItem("preview-selected-group", selectedGroup);

  loadQuestions(toSelect.file, { silent: true });
}

// =======================================================
// Load Questions
// =======================================================

async function loadQuestions(file, options) {
  const silent = options && options.silent;
  if (!silent) {
    questionList.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading...</p></div>';
  }

  try {
    const response = await fetch("../" + file + "?t=" + Date.now());
    questions = await response.json();
    filteredQuestions = questions.slice();

    updateStats();
    renderQuestions();
    applyDifficultyColors();
    restoreCurrentQuestion();
  } catch (e) {
    console.error(e);
    questionList.innerHTML = '<div class="loading"><p>Unable to load ' + file + '</p></div>';
  }
}

// =======================================================
// Scroll Position Restore
// =======================================================

function restoreCurrentQuestion() {
  const id = localStorage.getItem("preview-current-question");
  if (!id) return;

  requestAnimationFrame(function() {
    const element = document.querySelector('[data-question-id="' + id + '"]');
    if (!element) return;
    element.scrollIntoView({ behavior: "auto", block: "center" });
  });
}

let scrollTimer;
window.addEventListener("scroll", function() {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(saveVisibleQuestion, 150);
});

function saveVisibleQuestion() {
  const cards = document.querySelectorAll(".question-card");
  const middle = window.innerHeight / 2;
  let current = null;

  cards.forEach(function(card) {
    const rect = card.getBoundingClientRect();
    if (rect.top <= middle && rect.bottom >= middle) {
      current = card.dataset.questionId;
    }
  });

  if (current) {
    localStorage.setItem("preview-current-question", current);
  }
}

// =======================================================
// Events
// =======================================================

function bindEvents() {
  groupTabs.addEventListener("click", function(e) {
    const btn = e.target.closest(".group-tab");
    if (!btn) return;

    document.querySelectorAll(".group-tab").forEach(function(t) { t.classList.remove("active"); });
    btn.classList.add("active");

    selectedGroup = btn.dataset.groupId;
    localStorage.setItem("preview-selected-group", selectedGroup);
    localStorage.removeItem("preview-selected-category");

    searchInput.value = "";
    syncSearchWrap();
    renderCategoryList();
  });

  categoryList.addEventListener("click", function(e) {
    const btn = e.target.closest(".category-item");
    if (!btn) return;

    document.querySelectorAll(".category-item").forEach(function(i) { i.classList.remove("active"); });
    btn.classList.add("active");

    const file = btn.dataset.file;
    selectedCategory = manifest.categories.find(function(c) { return c.file === file; });
    localStorage.setItem("preview-selected-category", file);

    searchInput.value = "";
    syncSearchWrap();
    loadQuestions(file);
  });

  reloadBtn.addEventListener("click", function() {
    reloadCurrentCategory();
    lastReload = Date.now();
  });

  searchInput.addEventListener("input", function() {
    syncSearchWrap();
    filterQuestions();
  });

  clearSearch.addEventListener("click", function() {
    searchInput.value = "";
    syncSearchWrap();
    filterQuestions();
    searchInput.focus();
  });
}

function syncSearchWrap() {
  const wrap = searchInput.closest(".search-wrap");
  wrap.classList.toggle("has-value", searchInput.value.length > 0);
}

// =======================================================
// Search / Filter
// =======================================================

function filterQuestions() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    filteredQuestions = questions.slice();
  } else {
    filteredQuestions = questions.filter(function(q) {
      return (q.question || "").toLowerCase().includes(query) ||
             (q.answer   || "").toLowerCase().includes(query) ||
             (q.tip      || "").toLowerCase().includes(query) ||
             (q.tags     || []).join(" ").toLowerCase().includes(query);
    });
  }

  updateStats();
  renderQuestions();
  applyDifficultyColors();
}

// =======================================================
// Stats
// =======================================================

function updateStats() {
  questionCount.textContent = questions.length;
  filteredCount.textContent = filteredQuestions.length;
  currentCategory.textContent = selectedCategory ? selectedCategory.label : "—";
  document.title = (selectedCategory ? selectedCategory.label : "—") + " (" + filteredQuestions.length + ") — Interview Helper";
}

// =======================================================
// Render
// =======================================================

function renderQuestions() {
  questionList.innerHTML = "";

  if (!filteredQuestions.length) {
    questionList.innerHTML = '<div class="loading"><p>No questions found.</p></div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredQuestions.forEach(function(q, index) {
    const card = document.getElementById("questionTemplate").content.cloneNode(true);

    const article = card.querySelector(".question-card");
    article.dataset.questionId = q.id;

    card.querySelector(".question-id").textContent = "#" + (index + 1);

    const categoryBadge = card.querySelector(".badge.category");
    categoryBadge.textContent = selectedCategory.label;
    if (selectedCategory.color) {
      categoryBadge.style.background = selectedCategory.color + "1A";
      categoryBadge.style.color = selectedCategory.color;
    }

    const diff = card.querySelector(".badge.difficulty");
    if (q.difficulty) {
      diff.textContent = capitalize(q.difficulty);
    } else {
      diff.remove();
    }

    card.querySelector(".question-title").textContent = q.question;

    const tagContainer = card.querySelector(".tags");
    if (q.tags && q.tags.length) {
      q.tags.forEach(function(tag) {
        const span = document.createElement("span");
        span.textContent = "#" + tag;
        tagContainer.appendChild(span);
      });
    } else {
      tagContainer.remove();
    }

    card.querySelector(".answer").innerHTML = q.answer || "";

    if (q.tip) {
      const tipSection = card.querySelector(".tip-section");
      tipSection.classList.remove("hidden");
      card.querySelector(".tip").textContent = q.tip;
    } else {
      card.querySelector(".tip-section").remove();
    }

    if (q.code) {
      const codeSection = card.querySelector(".code-section");
      codeSection.classList.remove("hidden");
      card.querySelector("code").textContent = q.code;
      if (q.language) {
        card.querySelector(".language").textContent = q.language;
      }
    } else {
      card.querySelector(".code-section").remove();
    }

    if (q.deep) {
      const deepSection = card.querySelector(".deep-section");
      deepSection.classList.remove("hidden");
      card.querySelector(".deep").innerHTML = q.deep;
    } else {
      card.querySelector(".deep-section").remove();
    }

    fragment.appendChild(card);
  });

  questionList.appendChild(fragment);
}

// =======================================================
// Difficulty Colors
// =======================================================

const difficultyColors = {
  beginner:     { bg: "#DCFCE7", color: "#16A34A" },
  intermediate: { bg: "#FEF3C7", color: "#D97706" },
  advanced:     { bg: "#FEE2E2", color: "#DC2626" },
};

function applyDifficultyColors() {
  document.querySelectorAll(".badge.difficulty").forEach(function(badge) {
    const key = badge.textContent.trim().toLowerCase();
    const scheme = difficultyColors[key];
    if (!scheme) return;
    badge.style.background = scheme.bg;
    badge.style.color = scheme.color;
  });
}

// =======================================================
// Copy Button
// =======================================================

document.addEventListener("click", function(e) {
  if (!e.target.closest(".copy-btn")) return;
  const btn = e.target.closest(".copy-btn");
  const code = btn.closest(".code-section").querySelector("code").innerText;

  navigator.clipboard.writeText(code).then(function() {
    const original = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px"><path d="M2 8l4 4 8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';
    btn.style.color = "#4ADE80";
    setTimeout(function() {
      btn.innerHTML = original;
      btn.style.color = "";
    }, 1500);
  });
});

// =======================================================
// Reload
// =======================================================

async function reloadCurrentCategory() {
  const oldSearch = searchInput.value;
  await loadQuestions(selectedCategory.file);
  searchInput.value = oldSearch;
  syncSearchWrap();
  if (oldSearch) filterQuestions();
}

// =======================================================
// Reload Age Counter
// =======================================================

let lastReload = Date.now();

setInterval(function() {
  const seconds = Math.floor((Date.now() - lastReload) / 1000);
  reloadAge.textContent = seconds < 60 ? seconds + "s" : Math.floor(seconds / 60) + "m";
}, 1000);

// =======================================================
// Utils
// =======================================================

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// =======================================================
// Ready
// =======================================================

console.log("Interview Helper Preview Ready");