import { useWindowDimensions } from 'react-native';

/**
 * Common responsive layout breakpoint for POS-WMS.
 * Width >= 768px: Desktop/Tablet view with DesktopSidebar.
 * Width < 768px: Mobile view with BottomTabBar.
 */
export const DESKTOP_BREAKPOINT = 768;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}
