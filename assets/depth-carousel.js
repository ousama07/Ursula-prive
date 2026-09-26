/**
 * Úrsula Privée – Carrusel de productos con efecto de profundidad.
 * La tarjeta activa queda delante y centrada; la anterior y la siguiente asoman detrás, más pequeñas.
 * Circular, con flechas, indicadores, teclado y deslizamiento con el dedo o el ratón.
 */
class DepthCarousel extends HTMLElement {
  connectedCallback() {
    this.stage = this.querySelector('.depth-carousel__stage');
    this.slides = Array.from(this.querySelectorAll('.depth-carousel__slide'));
    this.dots = Array.from(this.querySelectorAll('.depth-carousel__dot'));
    this.count = this.slides.length;
    if (!this.stage || this.count === 0) return;

    const initial = parseInt(this.dataset.initialIndex || '0', 10);
    this.active = Number.isFinite(initial) && initial >= 0 && initial < this.count ? initial : 0;
    this.drag = null;
    this.suppressClick = false;

    // Las fotos internas de cada tarjeta no deben competir con el gesto del carrusel
    this.querySelectorAll('.card-gallery slideshow-component').forEach((el) => el.setAttribute('disabled', 'true'));

    this.onClickCapture = this.onClickCapture.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onDragStart = (event) => event.preventDefault();

    this.stage.addEventListener('click', this.onClickCapture, true);
    this.stage.addEventListener('pointerdown', this.onPointerDown);
    this.stage.addEventListener('dragstart', this.onDragStart);
    this.addEventListener('keydown', this.onKeyDown);

    this.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.go(button.dataset.action === 'next' ? 1 : -1);
      });
    });

    this.dots.forEach((dot) => {
      dot.addEventListener('click', () => this.goTo(parseInt(dot.dataset.dot, 10)));
    });

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.stage);

    this.layout();
    // Activar las transiciones solo después de colocar las tarjetas (sin animación al cargar)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.setAttribute('data-ready', ''));
    });
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.stage?.removeEventListener('click', this.onClickCapture, true);
    this.stage?.removeEventListener('pointerdown', this.onPointerDown);
    this.stage?.removeEventListener('dragstart', this.onDragStart);
    this.removeListeners();
  }

  /* ---------- Navegación ---------- */

  go(step) {
    this.goTo(this.active + step);
  }

  goTo(index) {
    if (!Number.isFinite(index)) return;
    this.active = ((index % this.count) + this.count) % this.count;
    this.layout();
  }

  /** Distancia circular más corta entre una tarjeta y la activa */
  offsetOf(index) {
    let d = (((index - this.active) % this.count) + this.count) % this.count;
    if (d > this.count / 2) d -= this.count;
    return d;
  }

  /* ---------- Colocación de las capas ---------- */

  layout(dragPx = 0) {
    const width = this.slides[0].offsetWidth;
    if (!width) return;

    const styles = getComputedStyle(this);
    const shiftFactor = parseFloat(styles.getPropertyValue('--dc-shift')) || 0.62;
    const sideScale = parseFloat(styles.getPropertyValue('--dc-side-scale')) || 0.84;
    const shift = width * shiftFactor;
    this.shift = shift;

    // Flechas centradas en la foto (imagen cuadrada = ancho de la tarjeta)
    const gallery = this.slides[this.active].querySelector('.card-gallery');
    const arrowTop = gallery ? gallery.offsetHeight / 2 : width / 2;
    this.stage.style.setProperty('--dc-arrow-top', `${arrowTop}px`);

    const dragOffset = dragPx / shift;

    this.slides.forEach((slide, index) => {
      const d = this.offsetOf(index) + dragOffset;
      const a = Math.abs(d);
      const sign = d < 0 ? -1 : 1;

      let x;
      let scale;
      let opacity;
      if (a <= 1) {
        x = a * shift;
        scale = 1 - (1 - sideScale) * a;
        opacity = 1;
      } else {
        const b = Math.min(a - 1, 1.5);
        x = shift + b * shift * 0.55;
        scale = sideScale - 0.1 * Math.min(b, 1);
        opacity = Math.max(0, 1 - b * 1.4);
      }
      const veil = 0.48 * Math.min(a, 1);

      slide.style.transform = `translate3d(${(sign * x).toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)})`;
      slide.style.opacity = opacity.toFixed(3);
      slide.style.setProperty('--dc-veil', veil.toFixed(3));
      slide.style.zIndex = String(Math.round(100 - a * 10));

      const isActive = index === this.active;
      const isHidden = Math.abs(this.offsetOf(index)) > 1;
      slide.classList.toggle('is-active', isActive);
      slide.classList.toggle('is-side', !isActive && !isHidden);
      slide.toggleAttribute('inert', isHidden);
      if (isActive) {
        slide.removeAttribute('aria-hidden');
      } else {
        slide.setAttribute('aria-hidden', 'true');
      }
      // Las tarjetas laterales no deben recibir el foco del teclado
      slide.querySelectorAll('a, button, input, select, [tabindex]').forEach((el) => {
        if (isActive) {
          if (el.dataset.dcTabindex !== undefined) {
            if (el.dataset.dcTabindex === '') el.removeAttribute('tabindex');
            else el.setAttribute('tabindex', el.dataset.dcTabindex);
            delete el.dataset.dcTabindex;
          }
        } else if (el.dataset.dcTabindex === undefined) {
          el.dataset.dcTabindex = el.getAttribute('tabindex') ?? '';
          el.setAttribute('tabindex', '-1');
        }
      });
    });

    this.dots.forEach((dot, index) => {
      dot.setAttribute('aria-current', index === this.active ? 'true' : 'false');
    });
  }

  /* ---------- Clics ---------- */

  onClickCapture(event) {
    if (this.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      this.suppressClick = false;
      return;
    }
    const slide = event.target.closest('.depth-carousel__slide');
    if (slide && !slide.classList.contains('is-active')) {
      // Pulsar un vestido lateral lo trae al centro en lugar de abrirlo
      event.preventDefault();
      event.stopPropagation();
      this.goTo(parseInt(slide.dataset.index, 10));
    }
  }

  onKeyDown(event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.go(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.go(-1);
    }
  }

  /* ---------- Deslizamiento ---------- */

  onPointerDown(event) {
    if (event.button !== 0 || this.count < 2) return;
    if (event.target.closest('.depth-carousel__arrow, quick-add-component, .quick-add, button, input, select')) return;

    this.drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      lastX: event.clientX,
      lastT: performance.now(),
      velocity: 0,
      horizontal: null,
    };
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  onPointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (drag.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!drag.horizontal) {
        this.endDrag(false);
        return;
      }
      this.classList.add('is-dragging');
    }

    event.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    drag.velocity = (event.clientX - drag.lastX) / dt;
    drag.lastX = event.clientX;
    drag.lastT = now;

    // Resistencia suave para que el arrastre se sienta controlado
    const limit = (this.shift || 200) * 1.2;
    drag.dx = Math.max(-limit, Math.min(limit, dx));
    this.layout(drag.dx);
  }

  onPointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    this.endDrag(event.type === 'pointerup');
  }

  endDrag(commit) {
    const drag = this.drag;
    this.drag = null;
    this.removeListeners();
    this.classList.remove('is-dragging');
    if (!drag || !drag.horizontal) return;

    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 350);

    const shift = this.shift || 200;
    const threshold = Math.min(60, shift * 0.22);
    let step = 0;
    if (commit) {
      if (Math.abs(drag.dx) > threshold || Math.abs(drag.velocity) > 0.45) {
        step = drag.dx < 0 ? 1 : -1;
      }
    }
    if (step) this.go(step);
    else this.layout();
  }

  removeListeners() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }
}

if (!customElements.get('depth-carousel')) {
  customElements.define('depth-carousel', DepthCarousel);
}
