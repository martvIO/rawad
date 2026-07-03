// Request-validation middleware. Wraps a zod schema for any of body / params /
// query and rejects the request with a uniform 400 BEFORE the route handler
// runs — the "validate every input, and if invalid don't continue" guarantee.
//
// On rejection it also records a `malformed_input` security event so the admin
// Security page surfaces clients probing the API with bad payloads.
//
// On success the PARSED value (coerced + unknown keys stripped, per the schema)
// is written back to req.body/params/query, so handlers receive clean, typed
// data. Express 4's req.query/params are assignable (this breaks under Express 5).

import { Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";
import { AuthRequest } from "./auth";
import { recordSecurityEvent } from "../../securityEvents";

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

type Part = "params" | "query" | "body";
const PARTS: Part[] = ["params", "query", "body"];

export function validate(schemas: ValidationSchemas) {
  return function validateMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void {
    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (!result.success) {
        const issue = result.error.issues[0];
        const field = issue?.path?.join(".") || undefined;
        recordSecurityEvent("malformed_input", req, {
          detail: { part, field, code: issue?.code },
        });
        res.status(400).json({
          error: "invalid_input",
          part,
          field,
          detail: issue?.message,
        });
        return;
      }

      // Overwrite with the parsed value so handlers get coerced/stripped data.
      req[part] = result.data;
    }
    next();
  };
}
