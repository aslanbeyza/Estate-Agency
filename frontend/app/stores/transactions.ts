import { defineStore } from 'pinia';
import type {
  CreateTransactionPayload,
  Paginated,
  Transaction,
  TransactionListQuery,
  TransactionStage,
  TransactionStats,
} from '~/types';
import { withLoading } from './helpers';

export type {
  AgentRef,
  CommissionBreakdown,
  Transaction,
  TransactionStage,
} from '~/types';

const DEFAULT_LIMIT = 20;

const emptyStats = (): TransactionStats => ({
  counts: {
    agreement: 0,
    earnest_money: 0,
    title_deed: 0,
    completed: 0,
  },
  totalAgencyRevenue: 0,
  totalCompletedServiceFee: 0,
  total: 0,
});

/**
 * Transactions store. Server-driven pagination + server-computed stats:
 *
 * - `transactions` always holds *only the currently-loaded pages* for the
 *   active filter. The dashboard's KPI cards read from `stats` (fetched
 *   separately) instead of iterating this array, so the two concerns
 *   don't couple.
 * - `pagination` tracks offset / total / hasMore so the list page can
 *   show an infinite-scroll sentinel and deep-link via `?page=`.
 * - `filter` is the single source of truth for the currently-active
 *   server filter; changing it **resets** the accumulator.
 */
export const useTransactionsStore = defineStore('transactions', {
  state: () => ({
    transactions: [] as Transaction[],
    current: null as Transaction | null,
    stats: emptyStats() as TransactionStats,
    pagination: {
      limit: DEFAULT_LIMIT,
      offset: 0,
      total: 0,
      hasMore: false,
    },
    filter: { stage: undefined as TransactionStage | undefined },
    loading: false,
    loadingMore: false,
    error: null as string | null,
  }),

  getters: {
    byStage: (state) => (stage: TransactionStage) =>
      state.transactions.filter((t) => t.stage === stage),

    /** Server-computed counts, never derived from the windowed list. */
    counts: (state) => state.stats.counts,

    /** Server-computed agency revenue across *all* completed transactions. */
    totalAgencyRevenue: (state): number => state.stats.totalAgencyRevenue,

    /** Total rows matching the current server filter. */
    totalCount: (state): number => state.pagination.total,
  },

  actions: {
    /**
     * Loads page(s) of transactions for the active filter.
     *
     * - `append: true`   → next infinite-scroll step (adds onto the list).
     * - `append: false`  → replace the list (filter change, initial load,
     *                      or deep-link into `?page=N`).
     *
     * **Stage filter:** if the caller passes a `stage` property (including
     * explicit `undefined` for “all stages”), the store filter is updated.
     * Omitting `stage` keeps the previous filter — intentional for
     * `append: true` loads. Callers that mean “show everything” must pass
     * `stage: undefined` so a leftover filter from another page does not
     * desync KPI tabs from the list (stats are global; the list is filtered).
     */
    async fetchPage(
      opts: {
        limit?: number;
        offset?: number;
        stage?: TransactionStage;
        append?: boolean;
      } = {},
    ) {
      if ('stage' in opts) {
        this.filter.stage = opts.stage;
      }

      const append = !!opts.append;
      const limit = opts.limit ?? this.pagination.limit;
      const offset =
        opts.offset ?? (append ? this.pagination.offset + this.pagination.limit : 0);

      if (!append) this.transactions = [];

      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (this.filter.stage) params.set('stage', this.filter.stage);

      const run = async () => {
        const res = await useApi().get<Paginated<Transaction>>(
          `/transactions?${params.toString()}`,
        );
        this.transactions = append
          ? [...this.transactions, ...res.items]
          : res.items;
        this.pagination = {
          limit: res.limit,
          offset: res.offset,
          total: res.total,
          hasMore: res.hasMore,
        };
        return res;
      };

      if (append) {
        this.loadingMore = true;
        try {
          return await run();
        } finally {
          this.loadingMore = false;
        }
      }
      return withLoading(this, run);
    },

    /**
     * Deep-link entry point: if the URL says `?page=3`, we load pages
     * 1..3 so the user sees the same scroll depth that the URL implies.
     * Keeps the infinite-scroll illusion intact while supporting
     * shareable URLs.
     */
    async fetchThroughPage(
      page: number,
      opts: { limit?: number; stage?: TransactionStage } = {},
    ) {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const clamped = Math.max(1, Math.floor(page));
      // First request establishes the filter + resets accumulator.
      await this.fetchPage({ offset: 0, limit, stage: opts.stage, append: false });
      // Follow-up pages append. We stop early if `hasMore` goes false so
      // we never hit the server for an empty page.
      for (let p = 2; p <= clamped && this.pagination.hasMore; p++) {
        await this.fetchPage({ append: true, limit });
      }
    },

    async fetchStats() {
      this.stats = await useApi().get<TransactionStats>('/transactions/stats');
    },

    async fetchOne(id: string) {
      await withLoading(this, async () => {
        this.current = await useApi().get<Transaction>(`/transactions/${id}`);
      });
    },

    async create(payload: CreateTransactionPayload) {
      const api = useApi();
      const tx = await api.post<Transaction>('/transactions', payload);
      // Optimistic insert at the top of the current view so the user sees
      // their new row immediately. Stats are refreshed in the background
      // so the dashboard KPIs stay honest without blocking the UI.
      this.transactions.unshift(tx);
      this.pagination.total += 1;
      void this.fetchStats();
      return tx;
    },

    async updateStage(id: string, stage: TransactionStage) {
      const api = useApi();
      const updated = await api.patch<Transaction>(`/transactions/${id}/stage`, { stage });
      const idx = this.transactions.findIndex((t) => t._id === id);
      if (idx !== -1) this.transactions[idx] = updated;
      if (this.current?._id === id) this.current = updated;
      // Stage transitions change the counts and, on `completed`, the
      // agency revenue. Refresh the aggregate lazily.
      void this.fetchStats();
      return updated;
    },

    async remove(id: string) {
      const api = useApi();
      await api.del(`/transactions/${id}`);
      this.transactions = this.transactions.filter((t) => t._id !== id);
      this.pagination.total = Math.max(0, this.pagination.total - 1);
      if (this.current?._id === id) this.current = null;
      void this.fetchStats();
    },
  },
});
