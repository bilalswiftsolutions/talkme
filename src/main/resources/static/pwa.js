(function () {
    const dismissedKey = 'talkme.pwaInstallDismissed.v3';
    let deferredPrompt;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }

    function installApp() {
        if (!deferredPrompt) {
            const prompt = document.querySelector('.pwa-install-prompt');
            if (prompt) prompt.querySelector('span').textContent = 'Open the browser menu and choose Install app or Add to Home screen.';
            return;
        }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(() => {
            deferredPrompt = null;
            document.querySelectorAll('.pwa-install-button, .pwa-install-prompt').forEach(element => element.hidden = true);
        });
    }

    function dismissPrompt() {
        localStorage.setItem(dismissedKey, 'true');
        const prompt = document.querySelector('.pwa-install-prompt');
        if (prompt) prompt.hidden = true;
    }

    function createPrompt() {
        if (standalone || localStorage.getItem(dismissedKey) === 'true') return;
        if (document.querySelector('.pwa-install-prompt')) return;
        const prompt = document.createElement('aside');
        prompt.className = 'pwa-install-prompt';
        prompt.innerHTML = '<div><strong>Install Talkme</strong><span>Keep your calls one tap away.</span></div><button class="pwa-install-action" type="button">Install</button><button class="pwa-dismiss-action" type="button" aria-label="Dismiss install prompt">&times;</button>';
        prompt.querySelector('.pwa-install-action').addEventListener('click', installApp);
        prompt.querySelector('.pwa-dismiss-action').addEventListener('click', dismissPrompt);
        document.body.append(prompt);
    }

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        document.querySelectorAll('.pwa-install-button').forEach(button => button.hidden = false);
        createPrompt();
    });
    document.querySelectorAll('.pwa-install-button').forEach(button => button.hidden = standalone);
    createPrompt();
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        document.querySelectorAll('.pwa-install-button, .pwa-install-prompt').forEach(element => element.hidden = true);
    });
    document.addEventListener('click', event => {
        if (event.target.closest('.pwa-install-button')) installApp();
    });
})();