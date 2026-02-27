(function initWinMergeDiffModule(global) {
  class WinMergeDiffModule {
    constructor(opts) {
      this.overlay = document.getElementById(opts.overlayId);
      this.container = document.getElementById(opts.containerId);
      this.errorEl = document.getElementById(opts.errorId);
      this.btnPrev = document.getElementById(opts.prevBtnId);
      this.btnNext = document.getElementById(opts.nextBtnId);
      this.btnMergeRightToLeft = document.getElementById(opts.mergeRightToLeftBtnId);
      this.btnMergeLeftToRight = document.getElementById(opts.mergeLeftToRightBtnId);
      this.btnApplyLeft = document.getElementById(opts.applyLeftBtnId);
      this.btnApplyRight = document.getElementById(opts.applyRightBtnId);
      this.btnClose = document.getElementById(opts.closeBtnId);

      this.doc = null;
      this.callbacks = {
        onApplyLeft: null,
        onApplyRight: null,
        onClose: null
      };

      this.btnPrev.onclick = () => this.safeAction(() => this.doc.scrollToDiff('prev'));
      this.btnNext.onclick = () => this.safeAction(() => this.doc.scrollToDiff('next'));
      this.btnMergeRightToLeft.onclick = () => this.safeAction(() => this.doc.mergeCurrentChange('rhs'));
      this.btnMergeLeftToRight.onclick = () => this.safeAction(() => this.doc.mergeCurrentChange('lhs'));
      this.btnApplyLeft.onclick = () => this.safeAction(() => {
        if (this.callbacks.onApplyLeft) this.callbacks.onApplyLeft(this.doc.get('lhs'));
      });
      this.btnApplyRight.onclick = () => this.safeAction(() => {
        if (this.callbacks.onApplyRight) this.callbacks.onApplyRight(this.doc.get('rhs'));
      });
      this.btnClose.onclick = () => this.close();

      this.overlay.onclick = (ev) => {
        if (ev.target === this.overlay) {
          this.close();
        }
      };
    }

    safeAction(fn) {
      try {
        this.errorEl.textContent = '';
        fn();
      } catch (err) {
        this.errorEl.textContent = err && err.message ? err.message : String(err);
      }
    }

    ensureDoc() {
      if (this.doc) return;
      this.doc = new global.Mergely(`#${this.container.id}`, {
        license: 'lgpl',
        autoupdate: true,
        wrap_lines: false,
        line_numbers: true,
        cmsettings: {
          readOnly: false,
          lineWrapping: false
        }
      });
    }

    open({ leftText, rightText, onApplyLeft, onApplyRight, onClose }) {
      this.callbacks.onApplyLeft = onApplyLeft || null;
      this.callbacks.onApplyRight = onApplyRight || null;
      this.callbacks.onClose = onClose || null;

      this.ensureDoc();
      this.errorEl.textContent = '';
      this.overlay.classList.remove('hidden');
      this.doc.lhs(String(leftText || ''));
      this.doc.rhs(String(rightText || ''));
      this.doc.once('updated', () => {
        this.doc.scrollToDiff('next');
      });

      setTimeout(() => {
        try {
          this.doc.resize();
        } catch (err) {
          this.errorEl.textContent = err && err.message ? err.message : String(err);
        }
      }, 0);
    }

    close() {
      this.overlay.classList.add('hidden');
      if (this.callbacks.onClose) {
        this.callbacks.onClose();
      }
    }

    getLeft() {
      if (!this.doc) return '';
      return this.doc.get('lhs');
    }

    getRight() {
      if (!this.doc) return '';
      return this.doc.get('rhs');
    }
  }

  global.WinMergeDiffModule = WinMergeDiffModule;
})(window);
