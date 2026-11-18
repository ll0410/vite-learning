<script setup lang="ts">
// ch11：重依赖页面。它通过路由懒加载，被单独打成一个 chunk。
import { computed, ref } from 'vue'
import { groupBy, orderBy, sumBy } from 'lodash-es'

interface Row {
  id: number
  team: string
  score: number
}

const teams = ['alpha', 'beta', 'gamma']
const rows = ref<Row[]>(
  Array.from({ length: 500 }, (_, i) => ({
    id: i,
    team: teams[i % teams.length],
    score: (i * 37) % 100,
  })),
)

const summary = computed(() =>
  Object.entries(groupBy(rows.value, 'team')).map(([team, list]) => ({
    team,
    count: list.length,
    total: sumBy(list, 'score'),
    top: orderBy(list, 'score', 'desc').slice(0, 3),
  })),
)
</script>

<template>
  <section>
    <h1>Dashboard</h1>
    <p class="lead">
      这个页面依赖 <code>lodash-es</code>，通过路由懒加载：首屏不会下载它，进入本页才请求。
    </p>

    <div class="grid">
      <article v-for="item in summary" :key="item.team" class="panel">
        <h2>{{ item.team }}</h2>
        <p>条数：{{ item.count }}</p>
        <p>总分：{{ item.total }}</p>
        <p class="muted">
          Top3：{{ item.top.map((row) => row.score).join(', ') }}
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.lead {
  margin: 0 0 20px;
  color: #4b5563;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.panel {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}

.panel h2 {
  margin: 0 0 8px;
  font-size: 15px;
  text-transform: capitalize;
}

.panel p {
  margin: 4px 0;
  font-size: 14px;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>
