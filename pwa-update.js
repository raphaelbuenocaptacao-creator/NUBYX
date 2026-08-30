(() => {
  if (!('serviceWorker' in navigator)) return;

  const hadControllerAtBoot = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtBoot || reloading) return;
    reloading = true;
    window.location.reload();
  });
})();
