import { describe, expect, it } from 'vitest';
import { StudyLibrary } from '../../packages/core/src/study/library';
import { SecureNotesStore } from '../../packages/core/src/notes/secure-notes';
import type { KeyValueStore } from '../../packages/core/src/storage';

function storage(){
 const data=new Map<string,string>();const writes:{key:string;value:string}[]=[];let fail=false;
 const port:KeyValueStore={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(fail)throw new Error('quota');data.set(key,value);writes.push({key,value});}};
 return{port,writes,reject:()=>{fail=true;}};
}

describe('note / flashcard references',()=>{
 it('persists the reference in the first write and derives backlinks after reload without copying note contents',()=>{
  const store=storage();const notes=new SecureNotesStore('alice','room:a',store.port);const note=notes.createNote({title:'Biología',content:'Private unpublished material',ownerId:'alice'});
  const library=new StudyLibrary('room:a',store.port);const before=store.writes.length;
  const deck=library.createManualDeck({title:'Biología',ownerId:'alice',visibility:'private',sourceNoteId:note.id});
  expect(store.writes.slice(before)).toHaveLength(1);const saved=JSON.parse(store.writes.at(-1)!.value);
  expect(saved).toEqual([expect.objectContaining({id:deck.id,sourceType:'note',sourceNoteId:note.id,visibility:'private',cards:[]})]);
  expect(store.writes.at(-1)!.value).not.toContain('Private unpublished material');
  const reload=new StudyLibrary('room:a',store.port);expect(reload.listDecksForNote(note.id,'alice').map(d=>d.id)).toEqual([deck.id]);
  reload.renameDeck(deck.id,'Repaso final','alice');notes.updateNote(note.id,{title:'Nuevo título'},'alice');
  expect(new StudyLibrary('room:a',store.port).listDecksForNote(note.id,'alice')[0].title).toBe('Repaso final');
 });
 it('respects deck permissions and room scopes without using host privilege for backlink discovery',()=>{
  const store=storage();const library=new StudyLibrary('room:a',store.port);
  const mine=library.createManualDeck({title:'Mine',ownerId:'alice',visibility:'private',sourceNoteId:'note:same'});
  library.createManualDeck({title:'Bob secret',ownerId:'bob',visibility:'private',sourceNoteId:'note:same'});
  const shared=library.createManualDeck({title:'Shared',ownerId:'bob',visibility:'shared_read',sourceNoteId:'note:same'});
  const local=library.createManualDeck({title:'Local',ownerId:'local-host',visibility:'private',sourceNoteId:'note:same'});
  expect(new Set(library.listDecksForNote('note:same','alice').map(d=>d.id))).toEqual(new Set([mine.id,shared.id,local.id]));
  expect(new StudyLibrary('room:b',store.port).listDecksForNote('note:same','alice')).toEqual([]);
  const notes=new SecureNotesStore('alice','room:a',store.port);const privateNote=notes.createNote({title:'Private source',content:'Secret',ownerId:'bob',visibility:'private'});
  library.createManualDeck({title:'Visible deck',ownerId:'alice',visibility:'private',sourceNoteId:privateNote.id});
  expect(notes.getNote(privateNote.id,'alice')).toBeNull();
 });
 it('does not cascade note deletion into saved cards, and removes backlinks on deck deletion',()=>{
  const store=storage();const notes=new SecureNotesStore('alice','room:a',store.port);const note=notes.createNote({title:'Source',content:'Text',ownerId:'alice'});
  const library=new StudyLibrary('room:a',store.port);const deck=library.createManualDeck({title:'Deck',ownerId:'alice',sourceNoteId:note.id});
  library.saveDeck({...deck,cards:[{id:'card',question:'Q',answer:'A',difficulty:'easy',topic:'Topic',tags:[]}]});
  notes.deleteNote(note.id,'alice');expect(notes.getNote(note.id,'alice')).toBeNull();
  const reload=new StudyLibrary('room:a',store.port);expect(reload.getDeck(deck.id)?.cards[0].answer).toBe('A');
  expect(reload.deleteDeck(deck.id,'alice',false)).toBe(true);expect(new StudyLibrary('room:a',store.port).listDecksForNote(note.id,'alice')).toEqual([]);
 });
 it('does not leave an unlinked or phantom deck when the first save fails',()=>{
  const store=storage();const library=new StudyLibrary('room:a',store.port);store.reject();
  expect(()=>library.createManualDeck({title:'Failed',ownerId:'alice',sourceNoteId:'note:one'})).toThrow();
  expect(library.listDecks()).toEqual([]);expect(new StudyLibrary('room:a',store.port).listDecks()).toEqual([]);expect(store.writes).toEqual([]);
 });
 it('leaves old manual decks unlinked rather than guessing from titles',()=>{
  const store=storage();const library=new StudyLibrary('',store.port);const old=library.createManualDeck('Apunte: Source','alice');
  expect(old.sourceType).toBe('manual');expect(old.sourceNoteId).toBeUndefined();expect(new StudyLibrary('',store.port).listDecksForNote('note:source','alice')).toEqual([]);
 });
});
