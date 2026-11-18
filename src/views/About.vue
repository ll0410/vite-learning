<template>
  <section>
    <h1>关于这个实验室</h1>
    <p class="lead">
      这个项目是一天学完 Vite 的动手路线载体：从最小项目开始，按章节逐步演进。
    </p>
    <ul class="list">
      <li>每一章对应一个 git tag（<code>ch01</code> ~ <code>ch12</code>）。</li>
      <li>卡住时用 <code>git diff ch05 ch06</code> 对照参考实现。</li>
      <li>文档在 <code>docs/</code> 目录，按章节编号阅读。</li>
    </ul>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.lead {
  margin: 0 0 16px;
  color: #4b5563;
}

.list {
  margin: 0;
  padding-left: 20px;
  color: #374151;
  line-height: 2;
}
</style>
