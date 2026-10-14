import { ActivityFeed } from "@/components/ActivityFeed";
import { PageHeader } from "@/components/PageHeader";

/** Your full activity log (uploads, shares, backups, sign-ins...). */
export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" description="A record of everything that happened in your account." />
      <ActivityFeed endpoint="/activity" />
    </>
  );
}
