function toggleDropdown() {
    const btn = document.getElementById('profile-btn');
    const dd = document.getElementById('profile-dropdown');
    const isOpen = dd.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen);
}

document.addEventListener('click', e => {
    const profile = document.getElementById('profile');
    if (!profile.contains(e.target)) {
        document.getElementById('profile-dropdown').classList.remove('open');
        document.getElementById('profile-btn').setAttribute('aria-expanded', 'false');
    }
});