import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or was moved."
        action={
          <Button variant="gradient" asChild>
            <Link to="/">Go home</Link>
          </Button>
        }
      />
    </div>
  );
}
