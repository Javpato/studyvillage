export * from '../../../packages/core/src/whiteboard/selection';
import * as geometry from '../../../packages/core/src/whiteboard/selection';
import type {BoardStroke,BoardPoint} from '../../../packages/core/src/protocol/types';
import {textBox} from './draw';
export const objectBounds=(stroke:BoardStroke)=>geometry.objectBounds(stroke,textBox);
export const selectionBounds=(strokes:BoardStroke[])=>geometry.selectionBounds(strokes,textBox);
export const selectedByArea=(strokes:BoardStroke[],path:BoardPoint[],lasso:boolean)=>geometry.selectedByArea(strokes,path,lasso,textBox);
