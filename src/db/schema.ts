import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('user'),
  authProvider: text('auth_provider').notNull().default('local'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const portfolioHoldings = pgTable('portfolio_holdings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull().default('NSE'),
  country: text('country').notNull().default('India'),
  currency: text('currency').notNull().default('INR'),
  companyName: text('company_name').notNull(),
  sector: text('sector').notNull().default('Diversified'),
  quantity: doublePrecision('quantity').notNull(),
  avgBuyPrice: doublePrecision('avg_buy_price').notNull(),
  purchaseDate: text('purchase_date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const watchlistItems = pgTable('watchlist_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  listName: text('list_name').notNull().default('Core Watchlist'),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull().default('NSE'),
  country: text('country').notNull().default('India'),
  currency: text('currency').notNull().default('INR'),
  companyName: text('company_name').notNull(),
  sector: text('sector').notNull().default('Diversified'),
  targetPrice: doublePrecision('target_price'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const analysisHistory = pgTable('analysis_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull().default('NSE'),
  country: text('country').notNull().default('India'),
  currency: text('currency').notNull().default('INR'),
  companyName: text('company_name').notNull(),
  currentPrice: doublePrecision('current_price').notNull(),
  decision: text('decision').notNull(),
  confidenceScore: doublePrecision('confidence_score').notNull(),
  riskLevel: text('risk_level').notNull(),
  summary: text('summary').notNull(),
  indicatorsJson: text('indicators_json').notNull(),
  dataSource: text('data_source').notNull(),
  modelStatus: text('model_status').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const predictionHistory = pgTable('prediction_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull().default('NSE'),
  currency: text('currency').notNull().default('INR'),
  horizonDays: integer('horizon_days').notNull().default(7),
  modelName: text('model_name').notNull(),
  modelVersion: text('model_version').notNull(),
  currentPrice: doublePrecision('current_price').notNull(),
  predictedPrice: doublePrecision('predicted_price').notNull(),
  expectedReturnPct: doublePrecision('expected_return_pct').notNull(),
  mae: doublePrecision('mae').notNull(),
  rmse: doublePrecision('rmse').notNull(),
  mape: doublePrecision('mape').notNull(),
  directionalAccuracy: doublePrecision('directional_accuracy').notNull(),
  metricsJson: text('metrics_json').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const savedScreenerFilters = pgTable('saved_screener_filters', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  filtersJson: text('filters_json').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const searchHistory = pgTable('search_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull().default('NSE'),
  companyName: text('company_name').notNull(),
  country: text('country').notNull().default('India'),
  currency: text('currency').notNull().default('INR'),
  searchedAt: timestamp('searched_at').defaultNow().notNull(),
});

export const apiLogs = pgTable('api_logs', {
  id: serial('id').primaryKey(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  statusCode: integer('status_code').notNull(),
  durationMs: integer('duration_ms').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  holdings: many(portfolioHoldings),
  watchlist: many(watchlistItems),
  analyses: many(analysisHistory),
  predictions: many(predictionHistory),
  screenerFilters: many(savedScreenerFilters),
  searches: many(searchHistory),
}));

export const portfolioHoldingsRelations = relations(portfolioHoldings, ({ one }) => ({
  user: one(users, {
    fields: [portfolioHoldings.userId],
    references: [users.id],
  }),
}));

export const watchlistItemsRelations = relations(watchlistItems, ({ one }) => ({
  user: one(users, {
    fields: [watchlistItems.userId],
    references: [users.id],
  }),
}));

export const analysisHistoryRelations = relations(analysisHistory, ({ one }) => ({
  user: one(users, {
    fields: [analysisHistory.userId],
    references: [users.id],
  }),
}));

export const predictionHistoryRelations = relations(predictionHistory, ({ one }) => ({
  user: one(users, {
    fields: [predictionHistory.userId],
    references: [users.id],
  }),
}));

export const savedScreenerFiltersRelations = relations(savedScreenerFilters, ({ one }) => ({
  user: one(users, {
    fields: [savedScreenerFilters.userId],
    references: [users.id],
  }),
}));

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  user: one(users, {
    fields: [searchHistory.userId],
    references: [users.id],
  }),
}));
