const Auth = {
  showLogin: true,

  async init() {
    document.getElementById('authSwitchLink').addEventListener('click', () => this.toggleForms());
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const pass = document.getElementById('loginPassword').value.trim();
      if (!email || !pass) { this.showError('Please fill in all fields'); return; }
      await this.login(email, pass);
    });
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signupName').value.trim();
      const email = document.getElementById('signupEmail').value.trim();
      const pass = document.getElementById('signupPassword').value.trim();
      const dob = document.getElementById('signupDob').value;
      if (!name || !email || !pass || !dob) { this.showError('Please fill in all fields'); return; }
      await this.signup(name, email, pass, dob);
    });
    this._setupTogglePass();

    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('logoutBtnMobile').addEventListener('click', () => this.logout());

    // Reset password (DOB-based)
    document.getElementById('forgotPasswordLink').addEventListener('click', () => this.showForgotPassword());
    document.getElementById('backToLoginLink').addEventListener('click', () => this.hideForgotPassword());
    document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.resetPassword();
    });

    this._resetFormHtml = document.getElementById('resetPasswordForm').innerHTML;

    if (Store.getUser()) this.showApp();
  },

  _setupTogglePass(scope) {
    (scope || document).querySelectorAll('.toggle-pass').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        btn.textContent = isPass ? 'Hide' : 'Show';
      });
    });
  },

  toggleForms() {
    this.showLogin = !this.showLogin;
    document.getElementById('loginForm').classList.toggle('hidden', !this.showLogin);
    document.getElementById('signupForm').classList.toggle('hidden', this.showLogin);
    document.getElementById('authSwitchText').textContent = this.showLogin ? "Don't have an account?" : 'Already have an account?';
    document.getElementById('authSwitchLink').textContent = this.showLogin ? 'Sign Up' : 'Log In';
    document.getElementById('authError').classList.remove('show');
  },

  async login(email, pass) {
    try {
      await Store.login(email, pass);
      this.showApp();
    } catch (err) {
      this.showError(err.message || 'Invalid email or password');
    }
  },

  async signup(name, email, pass, dob) {
    try {
      await Store.signup(name, email, pass, dob);
      this.showApp();
    } catch (err) {
      this.showError(err.message || err.message || 'Signup failed');
    }
  },

  logout() {
    Store.clearUser();
    document.getElementById('mainNav').classList.add('hidden');
    Utils.showPage('auth');
    localStorage.removeItem('pulse_last_page');
    this.showLogin = true;
    document.querySelector('.auth-page > .auth-box')?.classList.remove('hidden');
    document.getElementById('forgotPasswordBox').classList.add('hidden');
    document.getElementById('authError')?.classList.remove('show');
  },

  async showApp() {
    if (this._showingApp) return;
    this._showingApp = true;
    try {
      const user = Store.getUser();
      if (!user) { this.showError('Session not found. Please log in again.'); return; }

      // Explicitly hide all auth page elements
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('signupForm').classList.add('hidden');
      document.getElementById('forgotPasswordBox').classList.add('hidden');
      document.getElementById('authError').classList.remove('show');
      const switchEls = document.querySelectorAll('.auth-switch');
      switchEls.forEach(el => el.classList.add('hidden'));

      document.getElementById('userBadge').textContent = user.name;
      document.getElementById('userBadgeMobile').textContent = user.name;
      document.getElementById('mainNav').classList.remove('hidden');
      const lastPage = localStorage.getItem('pulse_last_page');
      const page = (lastPage && lastPage !== 'auth') ? lastPage : 'dashboard';
      Utils.showPage(page);
      try {
        if (page === 'dashboard') await Dashboard.init();
        else if (page === 'tasks') await Tasks.init();
        else if (page === 'timetable') await Timetable.init();
        else if (page === 'goals') await Goals.init();
        else if (page === 'analytics') await Analytics.init();
        else if (page === 'progress') await Progress.init();
        else if (page === 'assistant') AIAssistant.init();
      } catch (e) { console.warn('Page init after login:', e); }
      this.setupProfile();
    } catch (e) { console.error('showApp error:', e); this.showError('Something went wrong loading the app.'); }
    finally { this._showingApp = false; }
  },

  setupProfile() {
    const badge = document.getElementById('userBadge');
    badge.style.cursor = 'pointer';
    badge.title = 'Edit profile';
    badge.addEventListener('click', () => this.openProfileModal());
    const mobileBadge = document.getElementById('userBadgeMobile');
    if (mobileBadge) {
      mobileBadge.style.cursor = 'pointer';
      mobileBadge.addEventListener('click', () => this.openProfileModal());
    }
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveProfile();
    });
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      });
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.add('hidden');
      });
    });
  },

  async openProfileModal() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pulse_token') }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) Store.setUser(data.user);
      }
    } catch (e) { console.warn('Profile fetch failed', e); }
    const user = Store.getUser();
    document.getElementById('profileName').value = user.name || '';
    document.getElementById('profileModal').classList.remove('hidden');
  },

  async saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    if (!name) { Toast.error('Name is required'); return; }

    try {
      const res = await api('/auth/profile', {
        method: 'PUT',
        body: { name }
      });
      Store.setUser(res.user);
      document.getElementById('userBadge').textContent = res.user.name;
      document.getElementById('userBadgeMobile').textContent = res.user.name;
      document.getElementById('profileModal').classList.add('hidden');
      Toast.success('Profile updated');
    } catch (err) {
      Toast.error(err.message || 'Failed to update profile');
    }
  },

  showError(msg) {
    const el = document.getElementById('authError');
    el.innerHTML = msg;
    el.classList.add('show');
  },

  showForgotPassword() {
    document.querySelector('.auth-page > .auth-box')?.classList.add('hidden');
    document.getElementById('forgotPasswordBox').classList.remove('hidden');
    document.getElementById('authError')?.classList.remove('show');

    // Restore form if it was replaced by success message
    const form = document.getElementById('resetPasswordForm');
    if (!form.querySelector('#resetEmail')) {
      form.innerHTML = this._resetFormHtml;
      form.querySelector('#backToLoginLink')?.addEventListener('click', () => this.hideForgotPassword());
      this._setupTogglePass(form);
    }
  },

  hideForgotPassword() {
    document.querySelector('.auth-page > .auth-box')?.classList.remove('hidden');
    document.getElementById('forgotPasswordBox').classList.add('hidden');
    document.getElementById('authError')?.classList.remove('show');
  },

  async resetPassword() {
    const email = document.getElementById('resetEmail').value.trim();
    const dob = document.getElementById('resetDob').value;
    const password = document.getElementById('resetPassword').value.trim();
    const confirm = document.getElementById('resetPasswordConfirm').value.trim();
    if (!email || !dob || !password || !confirm) { Toast.error('Please fill in all fields'); return; }
    if (password !== confirm) { Toast.error('Passwords do not match'); return; }
    if (password.length < 6) { Toast.error('Password must be at least 6 characters'); return; }

    const btn = document.querySelector('#resetPasswordForm .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Resetting\u2026';

    try {
      const data = await api('/auth/reset-password', {
        method: 'POST', body: { email, dob, password }
      });
      document.getElementById('resetPasswordForm').innerHTML = `
        <div class="reset-success">
          <div class="reset-checkmark">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="var(--secondary)" stroke-width="3" fill="none" stroke-dasharray="138" stroke-dashoffset="138" class="check-circle"/>
              <path d="M14 24l6 6 14-14" stroke="var(--secondary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="34" stroke-dashoffset="34" class="check-path"/>
            </svg>
          </div>
          <p class="reset-success-text">${data.message || 'Password reset successful!'}</p>
          <button id="goToLoginBtn" class="btn-primary" style="width:100%;margin-top:0.5rem;">Go to Login</button>
        </div>`;
      document.getElementById('goToLoginBtn').addEventListener('click', () => {
        document.querySelector('.auth-page > .auth-box')?.classList.remove('hidden');
        document.getElementById('forgotPasswordBox').classList.add('hidden');
      });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Reset Password';
      Toast.error(err.message || 'Failed to reset password');
    }
  }
};
