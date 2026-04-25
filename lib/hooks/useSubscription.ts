"use client";

import { useState, useEffect } from "react";

interface SubscriptionState {
  status: string;
  planId: string | null;
  periodEnd: string | null;
  loading: boolean;
}

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>({
    status: "none",
    planId: null,
    periodEnd: null,
    loading: true,
  });

  useEffect(() => {
    fetch("/api/stripe/subscription")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setState({
            status: json.data.status,
            planId: json.data.planId,
            periodEnd: json.data.periodEnd,
            loading: false,
          });
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false }));
      });
  }, []);

  return state;
}

export function isActive(status: string): boolean {
  return status === "active" || status === "past_due";
}
