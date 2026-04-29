/**
 * HTML 内容清洗工具
 * 用于防止 XSS 攻击，清洗富文本内容中的恶意脚本
 */

import DOMPurify from 'isomorphic-dompurify'

/**
 * 清洗 HTML 内容
 * @param dirty - 未经清洗的 HTML 字符串
 * @returns 清洗后的安全 HTML 字符串
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'a',
      'img',
      'span',
      'div',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel'],
  })
}
