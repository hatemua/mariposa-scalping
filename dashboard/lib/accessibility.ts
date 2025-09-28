// Accessibility utilities for the dashboard

/**
 * Screen reader only class for visually hidden but accessible text
 */
export const srOnly = 'sr-only';

/**
 * Focus management utilities
 */
export class FocusManager {
  private static focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]'
  ].join(',');

  static getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
    return Array.from(container.querySelectorAll(this.focusableSelectors));
  }

  static getFirstFocusableElement(container: HTMLElement = document.body): HTMLElement | null {
    const focusableElements = this.getFocusableElements(container);
    return focusableElements[0] || null;
  }

  static getLastFocusableElement(container: HTMLElement = document.body): HTMLElement | null {
    const focusableElements = this.getFocusableElements(container);
    return focusableElements[focusableElements.length - 1] || null;
  }

  static trapFocus(container: HTMLElement): () => void {
    const focusableElements = this.getFocusableElements(container);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);

    // Focus the first element
    firstElement?.focus();

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }
}

/**
 * Keyboard navigation utilities
 */
export class KeyboardNavigation {
  static KEYS = {
    ESCAPE: 'Escape',
    ENTER: 'Enter',
    SPACE: ' ',
    TAB: 'Tab',
    ARROW_UP: 'ArrowUp',
    ARROW_DOWN: 'ArrowDown',
    ARROW_LEFT: 'ArrowLeft',
    ARROW_RIGHT: 'ArrowRight',
    HOME: 'Home',
    END: 'End'
  } as const;

  static handleArrowNavigation(
    event: KeyboardEvent,
    items: HTMLElement[],
    currentIndex: number,
    options: {
      vertical?: boolean;
      horizontal?: boolean;
      loop?: boolean;
      onIndexChange?: (newIndex: number) => void;
    } = {}
  ): number {
    const { vertical = true, horizontal = false, loop = true, onIndexChange } = options;
    let newIndex = currentIndex;

    if (vertical && (event.key === this.KEYS.ARROW_UP || event.key === this.KEYS.ARROW_DOWN)) {
      event.preventDefault();
      newIndex = event.key === this.KEYS.ARROW_UP
        ? currentIndex - 1
        : currentIndex + 1;
    }

    if (horizontal && (event.key === this.KEYS.ARROW_LEFT || event.key === this.KEYS.ARROW_RIGHT)) {
      event.preventDefault();
      newIndex = event.key === this.KEYS.ARROW_LEFT
        ? currentIndex - 1
        : currentIndex + 1;
    }

    if (event.key === this.KEYS.HOME) {
      event.preventDefault();
      newIndex = 0;
    }

    if (event.key === this.KEYS.END) {
      event.preventDefault();
      newIndex = items.length - 1;
    }

    // Handle looping
    if (loop) {
      if (newIndex < 0) newIndex = items.length - 1;
      if (newIndex >= items.length) newIndex = 0;
    } else {
      newIndex = Math.max(0, Math.min(items.length - 1, newIndex));
    }

    if (newIndex !== currentIndex) {
      items[newIndex]?.focus();
      onIndexChange?.(newIndex);
    }

    return newIndex;
  }
}

/**
 * ARIA utilities
 */
export class AriaUtils {
  static announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;

    document.body.appendChild(announcement);

    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  static generateId(prefix: string = 'element'): string {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static createDescribedBy(element: HTMLElement, descriptionId: string): void {
    const existingDescribedBy = element.getAttribute('aria-describedby');
    const describedBy = existingDescribedBy
      ? `${existingDescribedBy} ${descriptionId}`
      : descriptionId;
    element.setAttribute('aria-describedby', describedBy);
  }

  static removeDescribedBy(element: HTMLElement, descriptionId: string): void {
    const describedBy = element.getAttribute('aria-describedby');
    if (describedBy) {
      const newDescribedBy = describedBy
        .split(' ')
        .filter(id => id !== descriptionId)
        .join(' ');

      if (newDescribedBy) {
        element.setAttribute('aria-describedby', newDescribedBy);
      } else {
        element.removeAttribute('aria-describedby');
      }
    }
  }
}

/**
 * Color contrast utilities
 */
export class ColorUtils {
  static getContrastRatio(color1: string, color2: string): number {
    const luminance1 = this.getLuminance(color1);
    const luminance2 = this.getLuminance(color2);
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  private static getLuminance(color: string): number {
    const rgb = this.hexToRgb(color);
    if (!rgb) return 0;

    const [r, g, b] = rgb.map(value => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  private static hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16)
        ]
      : null;
  }

  static meetsContrastRequirement(
    color1: string,
    color2: string,
    level: 'AA' | 'AAA' = 'AA',
    size: 'normal' | 'large' = 'normal'
  ): boolean {
    const ratio = this.getContrastRatio(color1, color2);
    const requirement = level === 'AAA'
      ? (size === 'large' ? 4.5 : 7)
      : (size === 'large' ? 3 : 4.5);

    return ratio >= requirement;
  }
}

/**
 * Motion utilities for reduced motion preference
 */
export class MotionUtils {
  static prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  static respectMotionPreference<T>(
    normalValue: T,
    reducedValue: T
  ): T {
    return this.prefersReducedMotion() ? reducedValue : normalValue;
  }

  static getAnimationDuration(defaultDuration: number): number {
    return this.prefersReducedMotion() ? 0 : defaultDuration;
  }
}

/**
 * Form accessibility utilities
 */
export class FormUtils {
  static validateAndAnnounce(
    field: HTMLInputElement | HTMLTextAreaElement,
    validator: (value: string) => string | null
  ): boolean {
    const error = validator(field.value);
    const errorId = `${field.id}-error`;
    let errorElement = document.getElementById(errorId);

    if (error) {
      if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = errorId;
        errorElement.className = 'text-sm text-red-600 dark:text-red-400 mt-1';
        errorElement.setAttribute('role', 'alert');
        field.parentElement?.appendChild(errorElement);
      }

      errorElement.textContent = error;
      AriaUtils.createDescribedBy(field, errorId);
      AriaUtils.announceToScreenReader(`Error: ${error}`, 'assertive');
      return false;
    } else {
      if (errorElement) {
        errorElement.remove();
        AriaUtils.removeDescribedBy(field, errorId);
      }
      return true;
    }
  }

  static createFieldGroup(
    legend: string,
    fields: HTMLElement[]
  ): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    const legendElement = document.createElement('legend');
    legendElement.textContent = legend;
    legendElement.className = 'text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';

    fieldset.appendChild(legendElement);
    fields.forEach(field => fieldset.appendChild(field));

    return fieldset;
  }
}