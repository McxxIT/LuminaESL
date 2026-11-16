"use client";

import { useCallback } from "react";
import { findUserByEmail } from "../school/selectors";
import type { SchoolData, SchoolUser } from "../school/types";
import type { Account } from "../types";
import { useSchool } from "./useSchool";

/**
 * Maps the signed-in demo account to its school user record. Returns undefined while the store
 * is loading or when the account has no matching user.
 */
export function useCurrentUser(account: Pick<Account, "email"> | null | undefined): SchoolUser | undefined {
  const email = account?.email ?? null;
  const select = useCallback((data: SchoolData) => findUserByEmail(data, email), [email]);
  return useSchool(select);
}
