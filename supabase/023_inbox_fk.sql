/* 023_inbox_fk.sql */
/* Adds foreign key relationship between messages and sessions */

ALTER TABLE public.messages 
ADD CONSTRAINT messages_session_id_fkey 
FOREIGN KEY (session_id) 
REFERENCES public.sessions(session_id) 
ON DELETE CASCADE;
