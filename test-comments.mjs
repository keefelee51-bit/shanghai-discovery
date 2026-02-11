import fs from 'fs'

const comments = JSON.parse(fs.readFileSync('C:/Users/Lenovo/projects/xiaohongshu-scraper-test/data/xhs/json/search_comments_2026-02-09.json', 'utf-8'))

console.log('Total comments:', comments.length)
console.log('\nFirst 5 comments:\n')

comments.slice(0, 5).forEach((c, i) => {
  console.log(`${i + 1}. By: ${c.nickname}`)
  console.log(`   Post ID: ${c.note_id}`)
  console.log(`   Content: ${c.content.slice(0, 150)}`)
  console.log(`   Likes: ${c.like_count}`)
  console.log()
})
