// Small "Admin" button in the corner of every page, with a username/password prompt.
//
// This only hides the admin page from casual visitors. It is NOT security: the site is
// static and public, so anyone can read this file or open admin.html directly. That's
// fine because the admin page holds no keys of its own and only shows data that is already
// public on the site (the ticket list has initials and last names only).
const AdminLogin = (() => {
  // SHA-256 of "username:password", so the login isn't sitting here in plain text.
  const LOGIN_HASH = "7328508f70bb3e58bfaf92fe05e8386313736eade76bf56bddf6105e69e3cb0f";
  const KEY = "squatch-admin";

  const isSignedIn = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
  const signOut = () => { try { sessionStorage.removeItem(KEY); } catch {} };

  async function check(username, password) {
    const bytes = new TextEncoder().encode(`${username.trim().toLowerCase()}:${password}`);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    return hash === LOGIN_HASH;
  }

  function prompt(onSuccess) {
    let dialog = document.getElementById("admin-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "admin-dialog";
      dialog.className = "ticket-dialog admin-dialog";
      dialog.setAttribute("aria-labelledby", "admin-title");
      dialog.innerHTML = `
        <form method="dialog" novalidate>
          <div class="dialog-head">
            <div><p class="eyebrow">Team staff</p><h3 id="admin-title">Admin sign in</h3></div>
            <button type="button" class="icon-btn" data-close aria-label="Close">×</button>
          </div>
          <div class="field">
            <label for="admin-user">Username</label>
            <input id="admin-user" name="username" type="text" autocomplete="username" autocapitalize="off" required>
          </div>
          <div class="field">
            <label for="admin-pass">Password</label>
            <input id="admin-pass" name="password" type="password" autocomplete="current-password" required>
            <p class="error" id="admin-error" role="alert"></p>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Sign in</button>
        </form>`;
      document.body.appendChild(dialog);
      dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    }
    const form = dialog.querySelector("form");
    const error = dialog.querySelector("#admin-error");
    form.reset();
    error.textContent = "";
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (await check(form.elements.username.value, form.elements.password.value)) {
        try { sessionStorage.setItem(KEY, "1"); } catch {}
        dialog.close();
        onSuccess();
      } else {
        error.textContent = "That username and password don't match.";
        form.elements.password.select();
      }
    };
    dialog.showModal();
    form.elements.username.focus();
  }

  // The corner button (not on the admin page itself).
  if (!/admin\.html$/.test(location.pathname)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "admin-corner";
    btn.setAttribute("aria-label", "Admin");
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    btn.addEventListener("click", () => {
      if (isSignedIn()) location.href = "admin.html";
      else prompt(() => { location.href = "admin.html"; });
    });
    document.body.appendChild(btn);
  }

  return { isSignedIn, signOut, prompt };
})();
