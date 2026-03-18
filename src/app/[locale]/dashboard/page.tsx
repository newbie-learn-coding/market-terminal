import { setRequestLocale } from 'next-intl/server';
import { SessionDashboard } from '@/components/dashboard/SessionDashboard';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SessionDashboard />;
}
