export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'farmledger-theme';

export const storedTheme = (): ThemeChoice => (localStorage.getItem(KEY) as ThemeChoice | null) ?? 'system';

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(choice: ThemeChoice): void {
  const theme = resolve(choice);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#16191b' : '#f5f2e9');
}

export function applyStoredTheme(): void {
  apply(storedTheme());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(storedTheme()));
}

export function setTheme(choice: ThemeChoice): void {
  localStorage.setItem(KEY, choice);
  apply(choice);
}
