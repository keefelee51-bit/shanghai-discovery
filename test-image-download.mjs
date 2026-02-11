// Quick test to see if image download works with headers
import fs from 'fs'

const testUrl = 'http://sns-webpic-qc.xhscdn.com/202602092025/edc749e41df3cee28cd2ebd36ca813f8/1040g2sg30vbr80ms0605pa18r2f8kkshbr3jv18!nc_n_webp_prv_1'

console.log('Testing image download from XHS...\n')

try {
  const response = await fetch(testUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.xiaohongshu.com/',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
    }
  })

  console.log(`Status: ${response.status}`)
  console.log(`Content-Type: ${response.headers.get('content-type')}`)

  if (response.ok) {
    const buffer = Buffer.from(await response.arrayBuffer())
    console.log(`✓ Downloaded ${buffer.length} bytes`)
  } else {
    console.log(`✗ Failed: ${response.status} ${response.statusText}`)
  }
} catch (err) {
  console.error(`✗ Error: ${err.message}`)
}
