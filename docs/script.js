document.querySelectorAll('.sidebar nav a').forEach(a => {
  if (a.href === location.href || a.href === location.href.replace(/\/$/, ''))
    a.classList.add('active')
})
