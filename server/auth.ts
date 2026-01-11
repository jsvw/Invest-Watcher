import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import { db } from "./db";
import { users, platforms, investments, valuations, assets, assetValuations } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import connectPgSimple from "connect-pg-simple";

const PgSession = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string(),
});

export function setupAuth(app: Express) {
  // Trust proxy for Replit's reverse proxy (required for secure cookies)
  app.set("trust proxy", 1);
  
  const isProduction = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
  
  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: isProduction ? "none" : "lax",
      },
    })
  );

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = registerSchema.parse(req.body);

      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const [newUser] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          passwordHash,
          name: name || null,
        })
        .returning();

      req.session.userId = newUser.id;
      
      res.status(201).json({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        currency: newUser.currency,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Registration error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      req.session.userId = user.id;
      
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        currency: user.currency,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      currency: user.currency,
    });
  });

  const updateCurrencySchema = z.object({
    currency: z.string().min(1, "Currency is required"),
  });

  app.post("/api/auth/update-currency", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { currency } = updateCurrencySchema.parse(req.body);

      const [updatedUser] = await db
        .update(users)
        .set({ currency })
        .where(eq(users.id, req.session.userId))
        .returning();

      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        currency: updatedUser.currency,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Update currency error:", err);
      res.status(500).json({ message: "Failed to update currency" });
    }
  });

  const changePasswordSchema = z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
  });

  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.session.userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      await db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, req.session.userId));

      res.json({ message: "Password changed successfully" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Change password error:", err);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.delete("/api/auth/account", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const userId = req.session.userId;

      // Get all platform IDs for the user
      const userPlatforms = await db
        .select({ id: platforms.id })
        .from(platforms)
        .where(eq(platforms.userId, userId));
      
      const platformIds = userPlatforms.map(p => p.id);

      if (platformIds.length > 0) {
        // Get all asset IDs for the user's platforms
        const userAssets = await db
          .select({ id: assets.id })
          .from(assets)
          .where(inArray(assets.platformId, platformIds));
        
        const assetIds = userAssets.map(a => a.id);

        // Delete asset valuations
        if (assetIds.length > 0) {
          await db.delete(assetValuations).where(inArray(assetValuations.assetId, assetIds));
        }

        // Delete assets
        await db.delete(assets).where(inArray(assets.platformId, platformIds));

        // Delete valuations
        await db.delete(valuations).where(inArray(valuations.platformId, platformIds));

        // Delete investments
        await db.delete(investments).where(inArray(investments.platformId, platformIds));

        // Delete platforms
        await db.delete(platforms).where(eq(platforms.userId, userId));
      }

      // Delete user
      await db.delete(users).where(eq(users.id, userId));

      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
        res.clearCookie("connect.sid");
        res.json({ message: "Account deleted successfully" });
      });
    } catch (err) {
      console.error("Delete account error:", err);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

export function getAuthenticatedUserId(req: Request): number | null {
  return req.session.userId || null;
}
