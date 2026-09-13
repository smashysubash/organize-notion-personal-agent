let currentType = "";

async function loadSuggestions() {
  const list = document.getElementById("list");
  list.textContent = "Loading…";
  try {
    const res = await fetch("/api/suggestions?status=Pending");
    const data = await res.json();

    if (!res.ok) {
      list.innerHTML = `
        <div class="card" style="border-left: 4px solid #ef5350;">
          <div class="card-head">
            <div class="card-title" style="color: #ef5350;">Error loading suggestions (${res.status})</div>
          </div>
          <div class="card-body">
            <p><strong>Server error:</strong> ${escapeHtml(data.error || "Internal Server Error")}</p>
            <p style="font-size:0.85rem;color:var(--muted);margin-top:0.75rem;">
              <strong>Common solutions:</strong>
              <ul style="margin: 0.35rem 0 0 1.2rem; line-height: 1.5;">
                <li><strong>Share Notion Page:</strong> Open your "🧠 Second Brain" page in Notion → <code>•••</code> → <strong>Connections</strong> → add your <strong>"Second Brain Agent"</strong> integration.</li>
                <li><strong>Check API Key:</strong> Verify <code>NOTION_API_KEY</code> is correctly set in your environment / Coolify.</li>
              </ul>
            </p>
          </div>
        </div>`;
      return;
    }

    if (!Array.isArray(data)) {
      list.innerHTML = `<div class="empty">Unexpected response from server.</div>`;
      return;
    }

    const items = data.filter((i) => !currentType || i.type === currentType);

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
  } catch (err) {
    list.innerHTML = `
      <div class="card" style="border-left: 4px solid #ef5350;">
        <div class="card-head">
          <div class="card-title" style="color: #ef5350;">Client / Network Error</div>
        </div>
        <div class="card-body">${escapeHtml(err.message)}</div>
      </div>`;
  }
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
  const res = await fetch(`/api/suggestions/${id}/${action}`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(`Action failed: ${data.error || res.statusText}`);
  }
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
      const res = await fetch(`/api/jobs/${btn.dataset.job}/run`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Job failed: ${data.error || res.statusText}`);
      }
      await loadSuggestions();
    } catch (err) {
      alert(`Job failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
});

loadSuggestions();
