import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://opencode-study.korah-group.top',
  output: 'static',
  integrations: [
    starlight({
      title: 'OpenCode Agent 源码学习',
      description: '面向 agent 生成的 OpenCode 源码学习文档系统。',
      favicon: '/favicon.svg',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/Livingpond/opencode-agent-study-site',
        },
      ],
      sidebar: [
        {
          label: '项目入口',
          items: [
            { label: '学习首页', slug: '' },
            { label: '框架选择', slug: 'agent/framework-decision' },
            { label: 'Agent 写作规范', slug: 'agent/writing-rules' },
          ],
        },
        {
          label: '源码章节',
          items: [{ autogenerate: { directory: 'chapters' } }],
        },
      ],
      customCss: ['./src/styles/custom.css'],
      pagefind: true,
      lastUpdated: true,
      editLink: {
        baseUrl: 'https://github.com/Livingpond/opencode-agent-study-site/edit/main/',
      },
      credits: true,
    }),
  ],
});
