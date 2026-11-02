import type { Metadata } from 'next';
import SettingsPage from '@/components/settings/SettingsPage';

export const metadata: Metadata = {
  title: 'Settings — Chess Review',
  description:
    'Board and piece themes, backgrounds, presets, sounds and accessibility options for Chess Review.',
};

export default function Page(): React.JSX.Element {
  return <SettingsPage />;
}
