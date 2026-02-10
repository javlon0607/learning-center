import { useNavigate } from 'react-router-dom'
import { Student } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Eye, Pencil, Trash2, Phone, Mail, User } from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'

interface StudentTableProps {
  students: Student[]
  onEdit: (student: Student) => void
  onDelete: (student: Student) => void
}

const statusConfig = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700 border-green-200' },
  inactive: { label: 'Inactive', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  graduated: { label: 'Graduated', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-700 border-red-200' },
} as const

function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status]
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      config.className
    )}>
      {config.label}
    </span>
  )
}

export function StudentTable({ students, onEdit, onDelete }: StudentTableProps) {
  const navigate = useNavigate()

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-soft">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="font-semibold">Student</TableHead>
            <TableHead className="font-semibold">Contact</TableHead>
            <TableHead className="font-semibold">Parent/Guardian</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Enrolled</TableHead>
            <TableHead className="w-[70px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student, index) => (
            <TableRow
              key={student.id}
              className={cn(
                'transition-colors',
                index % 2 === 0 ? 'bg-card' : 'bg-muted/20'
              )}
            >
              <TableCell>
                <button
                  onClick={() => navigate(`/students/${student.id}`)}
                  className="flex items-center gap-3 group"
                >
                  <div className="h-10 w-10 rounded-full bg-navy-100 flex items-center justify-center text-navy-700 font-medium text-sm">
                    {student.first_name[0]}{student.last_name[0]}
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {student.first_name} {student.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ID: {student.id}
                    </p>
                  </div>
                </button>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  {student.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{student.phone}</span>
                    </div>
                  )}
                  {student.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate max-w-[180px]">{student.email}</span>
                    </div>
                  )}
                  {!student.phone && !student.email && (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {student.parent_name ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{student.parent_name}</span>
                    </div>
                    {student.parent_phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{student.parent_phone}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={student.status} />
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatDate(student.created_at)}
                </span>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => navigate(`/students/${student.id}`)}
                      className="cursor-pointer"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(student)} className="cursor-pointer">
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Student
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(student)}
                      className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Student
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
