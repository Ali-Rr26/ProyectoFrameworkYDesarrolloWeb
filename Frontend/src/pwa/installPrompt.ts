// Invitación a instalar la PWA. Chrome/Edge emiten `beforeinstallprompt` una sola vez y
// puede ocurrir antes de que React monte: este módulo se importa en main.tsx para
// capturarlo desde el arranque y lo expone a los componentes con useSyncExternalStore.
import { useSyncExternalStore } from 'react';
import { detectIOS } from './updatePolicy';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  // El navegador permite mostrar su diálogo de instalación.
  canPrompt: boolean;
  // La app ya corre instalada (ventana propia): no se ofrece instalar.
  standalone: boolean;
  // iOS: sin diálogo; se muestran instrucciones.
  ios: boolean;
}

// Pasos para iPhone/iPad (Safari no tiene diálogo de instalación).
export const IOS_INSTALL_STEPS =
  'Para instalar MultiCatálogo en tu iPhone o iPad: toca Compartir y luego "Agregar a pantalla de inicio".';

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

let state: InstallState = {
  canPrompt: false,
  standalone: isStandalone(),
  ios: detectIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0),
};

const update = (patch: Partial<InstallState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

window.addEventListener('beforeinstallprompt', (event) => {
  // Se evita la mini barra automática: la app ofrece su propio botón "Instalar app".
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  update({ canPrompt: true });
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  update({ canPrompt: false, standalone: true });
});

// Muestra el diálogo del navegador. Devuelve true si el usuario aceptó.
export const promptInstall = async (): Promise<boolean> => {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  update({ canPrompt: false });
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useInstallPrompt = (): InstallState => useSyncExternalStore(subscribe, () => state);
