<template>
  <section>
    <h1>约定式路由首页</h1>
    <p>本页来自 <code>src/views/conventional/index.vue</code>，路由由插件生成。</p>
    <nav>
      <RouterLink to="/conventional/about">关于页</RouterLink>
      <RouterLink to="/conventional/users/42">动态用户页</RouterLink>
      <RouterLink to="/plugin-lab/code-generation#auto-discovery">返回代码生成示例</RouterLink>
    </nav>
  </section>
</template>

<style scoped>
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
</style>
