'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Plus, MoreHorizontal, MessageSquare, Phone, Mail, User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'

const INITIAL_COLUMNS = {
  new: { id: 'new', title: 'New Leads', items: [{ id: '1', name: 'Alex Johnson', company: 'Acme Corp', value: '$1,200', score: 85 }, { id: '2', name: 'Sarah Miller', company: 'TechStart', value: '$3,400', score: 62 }] },
  engaged: { id: 'engaged', title: 'Engaged', items: [{ id: '3', name: 'David Chen', company: 'Global Solutions', value: '$800', score: 92 }] },
  qualified: { id: 'qualified', title: 'Qualified', items: [] },
  won: { id: 'won', title: 'Closed Won', items: [{ id: '4', name: 'Emma Wilson', company: 'Design Co', value: '$5,000', score: 99 }] },
  lost: { id: 'lost', title: 'Closed Lost', items: [] },
}

export default function PipelinePage() {
  const [columns, setColumns] = useState(INITIAL_COLUMNS)

  const onDragEnd = (result: any) => {
    if (!result.destination) return
    const { source, destination } = result
    
    if (source.droppableId !== destination.droppableId) {
      const sourceCol = columns[source.droppableId as keyof typeof columns]
      const destCol = columns[destination.droppableId as keyof typeof columns]
      const sourceItems = [...sourceCol.items]
      const destItems = [...destCol.items]
      const [removed] = sourceItems.splice(source.index, 1)
      destItems.splice(destination.index, 0, removed)
      
      setColumns({
        ...columns,
        [source.droppableId]: { ...sourceCol, items: sourceItems },
        [destination.droppableId]: { ...destCol, items: destItems }
      })
    } else {
      const column = columns[source.droppableId as keyof typeof columns]
      const copiedItems = [...column.items]
      const [removed] = copiedItems.splice(source.index, 1)
      copiedItems.splice(destination.index, 0, removed)
      
      setColumns({
        ...columns,
        [source.droppableId]: { ...column, items: copiedItems }
      })
    }
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-[1600px] mx-auto px-4 overflow-hidden">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <PageHeader title="Sales Pipeline" description="Manage your leads and deals visually." className="mb-0" />
        <Button className="bg-ink hover:bg-ink-secondary text-white shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Add Deal
        </Button>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full gap-4 min-w-max px-1">
            {Object.values(columns).map((column) => (
              <div key={column.id} className="w-80 flex flex-col bg-surface-muted/50 rounded-xl border border-surface-border shrink-0 max-h-full overflow-hidden">
                <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface/50 rounded-t-xl shrink-0">
                  <h3 className="font-semibold text-ink text-sm flex items-center gap-2">
                    {column.title} 
                    <span className="bg-surface-border/50 text-ink-muted text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {column.items.length}
                    </span>
                  </h3>
                  <Button variant="ghost" size="icon" className="w-6 h-6 text-ink-muted hover:text-ink">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>
                
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={`flex-1 overflow-y-auto p-3 space-y-3 min-h-[150px] ${snapshot.isDraggingOver ? 'bg-accent/5' : ''}`}
                    >
                      {column.items.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`bg-white border p-4 rounded-xl shadow-sm group ${
                                snapshot.isDragging ? 'border-accent shadow-md ring-2 ring-accent/20' : 'border-surface-border hover:border-ink/20'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h4 className="text-sm font-semibold text-ink">{item.name}</h4>
                                  <p className="text-[11px] text-ink-secondary flex items-center gap-1 mt-0.5"><User className="w-3 h-3" /> {item.company}</p>
                                </div>
                                <Avatar className="w-8 h-8 rounded border border-surface-border">
                                  <AvatarFallback className="text-[10px] bg-surface-muted text-ink">{item.name.substring(0,2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                              </div>
                              <div className="flex items-center justify-between mb-4">
                                <span className="font-bold text-ink text-sm">{item.value}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  item.score >= 80 ? 'bg-green-50 text-green-700 border-green-200' : 
                                  item.score >= 60 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-surface-muted text-ink-muted border-surface-border'
                                }`}>
                                  Score: {item.score}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 pt-3 border-t border-surface-border">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-ink-muted hover:text-accent rounded"><MessageSquare className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-ink-muted hover:text-accent rounded"><Mail className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-ink-muted hover:text-accent rounded"><Phone className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>
    </div>
  )
}
