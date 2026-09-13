let currentType = "";

async function loadSuggestions() {
  const list = document.getElementById("list");
  list.textContent = "Loading…";
  const res = await fetch("/api/suggestions?status=Pending");
  const items = (await res.json()).filter((i) => !currentType || i.type === currentType);

  if (!items.length) {
    list.innerHTML = `<div class="empty">Nothing pending${currentType ? ` in ${currentType}` : ""}. Run a job above.</div>`;
    return;
  }

  list.innerHTML = items.map(cardHtml).join("");
  list.querySelectorAll("[data-approve]").forEach((btn) =>
    btn.addEventListener("click", () => act(btn.dataset.approve, "approve"))
  );
  list.querySelectorAll("[data-dismiss]").forEach((btn) =>
    btn.addEventListener("click", () => act(btn.dataset.dismiss, "dismiss"))
  );
}

function cardHtml(item) {
  const showApprove = item.type !== "Digest";
  return `
    <div class="card">
      <div class="card-head">
        <div class="card-title">${escapeHtml(item.title)}</div>
        <div class="card-type">${escapeHtml(item.type ?? "")}</div>
      </div>
      <div class="card-body">${escapeHtml(item.body || "(no content)")}</div>
      <div class="card-actions">
        ${showApprove ? `<button class="approve" data-approve="${item.id}">Approve</button>` : ""}
        <button class="dismiss" data-dismiss="${item.id}">Dismiss</button>
        <a href="${item.url}" target="_blank" rel="noopener" style="align-self:center;font-size:0.8rem;color:var(--muted);margin-left:auto;">Open in Notion</a>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function act(id, action) {
  await fetch(`/api/suggestions/${id}/${action}`, { method: "POST" });
  loadSuggestions();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentType = tab.dataset.type;
    loadSuggestions();
  });
});

document.querySelectorAll("[data-job]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Running…";
    try {
      await fetch(`/api/jobs/${btn.dataset.job}/run`, { method: "POST" });
      await loadSuggestions();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
});

loadSuggestions();
