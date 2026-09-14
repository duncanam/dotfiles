import { CustomEditor } from '@earendil-works/pi-coding-agent';

// Pi wires onSubmit after invoking the editor factory. Decorate that slot rather
// than only intercepting `input`: built-in /compact and ! commands run before it.
export function routeEditor<T extends { onSubmit?: (text: string) => void; setText(text: string): void; addToHistory?(text: string): void }>(base: T, route: (text: string) => void): T {
  let hostSubmit = base.onSubmit;
  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (/^\/(?:pair-enable|pair-disable|pair-models|quit|reload)(?:\s|$)/.test(trimmed)) hostSubmit?.(text);
    else {
      base.addToHistory?.(text);
      base.setText('');
      route(text);
    }
  };
  Object.defineProperty(base, 'onSubmit', { configurable: true, get: () => submit, set: (handler) => { hostSubmit = handler; } });
  return base;
}
export { CustomEditor };
