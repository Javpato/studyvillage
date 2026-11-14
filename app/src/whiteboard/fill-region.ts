/** Scanline flood fill. A region reaching the image boundary is unbounded. */
export function enclosedRegion(data:Uint8ClampedArray,width:number,height:number,x:number,y:number):number[][]|null {
 if(x<0||y<0||x>=width||y>=height)return null;
 const start=(y*width+x)*4,target=Array.from(data.slice(start,start+4)),seen=new Uint8Array(width*height),stack=[y*width+x],runs:number[][]=[];
 const match=(n:number)=>{const i=n*4;return !seen[n]&&Math.abs(data[i+3]-target[3])<32&&(!target[3]||Math.abs(data[i]-target[0])<32&&Math.abs(data[i+1]-target[1])<32&&Math.abs(data[i+2]-target[2])<32);};
 while(stack.length){const n=stack.pop()!,row=Math.floor(n/width);if(!match(n))continue;let left=n%width,right=left;while(left>0&&match(row*width+left-1))left--;while(right+1<width&&match(row*width+right+1))right++;
 if(row===0||row===height-1||left===0||right===width-1)return null;
 runs.push([left,row,right-left+1,1]);for(let px=left;px<=right;px++){const at=row*width+px;seen[at]=1;if(match(at-width))stack.push(at-width);if(match(at+width))stack.push(at+width);}}
 // Merge vertically identical runs, keeping holes intact.
 const merged:number[][]=[],last=new Map<string,number[]>();for(const run of runs.sort((a,b)=>a[1]-b[1]||a[0]-b[0])){const key=run[0]+':'+run[2],previous=last.get(key);if(previous&&previous[1]+previous[3]===run[1])previous[3]++;else{merged.push(run);last.set(key,run);}}return merged;
}
