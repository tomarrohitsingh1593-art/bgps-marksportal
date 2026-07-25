window.BGPS_CONFIG = Object.freeze({
  appName: 'BG Public School',
  displayName: 'Academic Operations Portal',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbynrPG0HfLISVBMuGg1SRjnnwqpXwWm-yx_hcPo2CsmNdH9vOk4TKe3GKEvANdmsskq/exec',
  requestTimeoutMs: 25000,
  rollCount: 50
});

window.BGPS_PRINT_LAYOUT = Object.freeze({
  prepareFreeMoveHtml(value) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(value || '');
    wrapper.querySelectorAll('.bgps-free-stage').forEach((stage) => {
      const printHeight = Math.max(24, parseFloat(stage.style.getPropertyValue('--bgps-free-print-height') || 24) || 24);
      stage.style.setProperty('--bgps-free-stage-height', `${printHeight}px`);
      stage.style.height = 'var(--bgps-free-stage-height)';
    });
    return wrapper.innerHTML;
  }
});
