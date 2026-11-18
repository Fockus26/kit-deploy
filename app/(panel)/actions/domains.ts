"use server";
/**
 * Dominios (HANDOFF §3): add, remove, redirect, "Comprobar ahora". For
 * `useActionState(action, null)`; the logic is lib/panel/actions/domains.ts.
 */
import {
  addProjectDomain,
  checkProjectDomainsNow,
  type DomainAddResult,
  type DomainCheckResult,
  type DomainRedirectResult,
  type DomainRemoveResult,
  removeProjectDomain,
  setProjectDomainRedirect,
} from "@/lib/panel/actions/domains";
import { payload } from "@/lib/panel/actions/form";
import { actionDeps } from "@/lib/panel/runtime";

export async function addDomainAction(
  _prev: unknown,
  form: FormData,
): Promise<DomainAddResult> {
  return addProjectDomain(actionDeps(), payload(form));
}

export async function removeDomainAction(
  _prev: unknown,
  form: FormData,
): Promise<DomainRemoveResult> {
  return removeProjectDomain(actionDeps(), payload(form));
}

export async function setDomainRedirectAction(
  _prev: unknown,
  form: FormData,
): Promise<DomainRedirectResult> {
  return setProjectDomainRedirect(actionDeps(), payload(form));
}

export async function checkDomainsAction(
  _prev: unknown,
  form: FormData,
): Promise<DomainCheckResult> {
  return checkProjectDomainsNow(actionDeps(), payload(form));
}
