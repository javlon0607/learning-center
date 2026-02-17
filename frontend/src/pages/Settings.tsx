import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { settingsApi, profileApi, cronNotificationsApi, SystemSettings } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Users,
  Building,
  Bell,
  Shield,
  Database,
  ChevronRight,
  User,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react'

export function Settings() {
  const { hasRole, user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Fetch settings from API
  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getAll,
  })

  // Organization settings state
  const [orgName, setOrgName] = useState('')
  const [orgEmail, setOrgEmail] = useState('')
  const [orgPhone, setOrgPhone] = useState('')

  // Notification settings state
  const [paymentReminders, setPaymentReminders] = useState(true)
  const [paymentReminderDay, setPaymentReminderDay] = useState('10')
  const [newLeadAlerts, setNewLeadAlerts] = useState(true)
  const [enrollmentAlerts, setEnrollmentAlerts] = useState(true)
  const [scheduleAlerts, setScheduleAlerts] = useState(true)
  const [attendanceAlerts, setAttendanceAlerts] = useState(false)
  const [birthdayAlerts, setBirthdayAlerts] = useState(true)

  // Security settings state
  const [sessionTimeout, setSessionTimeout] = useState('30')

  // Password change dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Profile settings state
  const [profileName, setProfileName] = useState(user?.name || '')
  const [profileEmail, setProfileEmail] = useState(user?.email || '')

  // Load settings into state when fetched
  useEffect(() => {
    if (settings) {
      setOrgName(settings.organization_name || 'Learning Center')
      setOrgEmail(settings.contact_email || '')
      setOrgPhone(settings.contact_phone || '')
      setSessionTimeout(settings.session_timeout || '30')
      setPaymentReminders(settings.notification_payment_reminders !== 'false')
      setPaymentReminderDay(settings.payment_reminder_day || '10')
      setNewLeadAlerts(settings.notification_new_leads !== 'false')
      setEnrollmentAlerts(settings.notification_enrollment !== 'false')
      setScheduleAlerts(settings.notification_schedule !== 'false')
      setAttendanceAlerts(settings.notification_attendance === 'true')
      setBirthdayAlerts(settings.notification_birthdays !== 'false')
    }
  }, [settings])

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<SystemSettings>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to save settings', description: err.message, variant: 'destructive' })
    },
  })

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: { name?: string; email?: string }) => profileApi.update(data),
    onSuccess: () => {
      toast({ title: 'Profile updated' })
      // Refresh user info
      window.location.reload()
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update profile', description: err.message, variant: 'destructive' })
    },
  })

  // Password change mutation
  const changePasswordMutation = useMutation({
    mutationFn: ({ current, newPass }: { current: string; newPass: string }) =>
      profileApi.changePassword(current, newPass),
    onSuccess: () => {
      setPasswordDialogOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast({ title: 'Password changed successfully' })
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to change password', description: err.message, variant: 'destructive' })
    },
  })

  const handleSaveOrganization = () => {
    updateSettingsMutation.mutate({
      organization_name: orgName,
      contact_email: orgEmail,
      contact_phone: orgPhone,
    }, {
      onSuccess: () => toast({ title: 'Organization settings saved' }),
    })
  }

  const handleSaveNotifications = () => {
    updateSettingsMutation.mutate({
      notification_payment_reminders: paymentReminders ? 'true' : 'false',
      payment_reminder_day: paymentReminderDay,
      notification_new_leads: newLeadAlerts ? 'true' : 'false',
      notification_enrollment: enrollmentAlerts ? 'true' : 'false',
      notification_schedule: scheduleAlerts ? 'true' : 'false',
      notification_attendance: attendanceAlerts ? 'true' : 'false',
      notification_birthdays: birthdayAlerts ? 'true' : 'false',
    }, {
      onSuccess: () => toast({ title: 'Notification preferences saved' }),
    })
  }

  // Cron notifications trigger mutation
  const cronMutation = useMutation({
    mutationFn: () => cronNotificationsApi.run(),
    onSuccess: (data) => {
      toast({ title: `Check complete`, description: `${data.notifications_created} notification(s) created` })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: Error) => {
      toast({ title: 'Check failed', description: err.message, variant: 'destructive' })
    },
  })

  const handleSaveSecurity = () => {
    updateSettingsMutation.mutate({
      session_timeout: sessionTimeout,
    }, {
      onSuccess: () => toast({ title: 'Security settings saved' }),
    })
  }

  const handleSaveProfile = () => {
    if (!profileName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' })
      return
    }
    updateProfileMutation.mutate({ name: profileName, email: profileEmail })
  }

  const handleChangePassword = () => {
    if (!currentPassword) {
      toast({ title: 'Current password is required', variant: 'destructive' })
      return
    }
    if (!newPassword) {
      toast({ title: 'New password is required', variant: 'destructive' })
      return
    }
    if (newPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }
    changePasswordMutation.mutate({ current: currentPassword, newPass: newPassword })
  }

  const handleExport = async (type: string) => {
    toast({ title: `Exporting ${type}...`, description: 'Download will start shortly' })
  }

  if (loadingSettings) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-muted-foreground">Manage your application settings</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* User Management - Admin only */}
        {hasRole('admin') && (
          <Link to="/settings/users">
            <Card className="h-full cursor-pointer transition-all hover:bg-slate-50 hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">User Management</CardTitle>
                    <CardDescription>Manage users and permissions</CardDescription>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* Profile Settings */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <User className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Profile</CardTitle>
              <CardDescription>Your personal information</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile_name">Full Name</Label>
                <Input
                  id="profile_name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_email">Email</Label>
                <Input
                  id="profile_email"
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={user?.username || ''} disabled className="bg-slate-50" />
                <p className="text-xs text-muted-foreground">Username cannot be changed</p>
              </div>
              <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
                {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Organization Settings - Admin only */}
        {hasRole('admin') && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <Building className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Organization</CardTitle>
                <CardDescription>Business information and branding</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="org_name">Organization Name</Label>
                  <Input
                    id="org_name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org_email">Contact Email</Label>
                  <Input
                    id="org_email"
                    type="email"
                    value={orgEmail}
                    onChange={(e) => setOrgEmail(e.target.value)}
                    placeholder="contact@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org_phone">Contact Phone</Label>
                  <Input
                    id="org_phone"
                    value={orgPhone}
                    onChange={(e) => setOrgPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                  />
                </div>
                <Button onClick={handleSaveOrganization} disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notification Settings - Admin only */}
        {hasRole('admin') && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
                <Bell className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Notifications</CardTitle>
                <CardDescription>Configure notification preferences</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Payment Reminders</p>
                    <p className="text-sm text-muted-foreground">
                      Send reminders for upcoming payments
                    </p>
                  </div>
                  <Switch
                    checked={paymentReminders}
                    onCheckedChange={setPaymentReminders}
                  />
                </div>
                {paymentReminders && (
                  <div className="ml-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <Label htmlFor="payment_reminder_day" className="text-sm whitespace-nowrap">Reminder from day</Label>
                      <Input
                        id="payment_reminder_day"
                        type="number"
                        min="1"
                        max="28"
                        value={paymentReminderDay}
                        onChange={(e) => setPaymentReminderDay(e.target.value)}
                        className="w-20"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cronMutation.mutate()}
                        disabled={cronMutation.isPending}
                      >
                        {cronMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                        Check now
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Notifications are generated when the day of month reaches this value
                    </p>
                  </div>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Lead Follow-up Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified when lead follow-ups are overdue
                    </p>
                  </div>
                  <Switch
                    checked={newLeadAlerts}
                    onCheckedChange={setNewLeadAlerts}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Enrollment Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Notify teachers when students are enrolled or removed
                    </p>
                  </div>
                  <Switch
                    checked={enrollmentAlerts}
                    onCheckedChange={setEnrollmentAlerts}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Schedule Change Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Notify teachers when group schedules are modified
                    </p>
                  </div>
                  <Switch
                    checked={scheduleAlerts}
                    onCheckedChange={setScheduleAlerts}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Attendance Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Notify when attendance is not marked
                    </p>
                  </div>
                  <Switch
                    checked={attendanceAlerts}
                    onCheckedChange={setAttendanceAlerts}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">Birthday Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Show student birthdays in the notification bell
                    </p>
                  </div>
                  <Switch
                    checked={birthdayAlerts}
                    onCheckedChange={setBirthdayAlerts}
                  />
                </div>
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  Note: Email notifications require email service configuration.
                </p>
                <Button
                  onClick={handleSaveNotifications}
                  disabled={updateSettingsMutation.isPending}
                  className="mt-2"
                >
                  {updateSettingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security Settings */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <Shield className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Security</CardTitle>
              <CardDescription>Password and session settings</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {hasRole('admin') && (
                <div className="space-y-2">
                  <Label htmlFor="session_timeout">Session Timeout (minutes)</Label>
                  <Input
                    id="session_timeout"
                    type="number"
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    min="5"
                    max="120"
                  />
                  <p className="text-xs text-muted-foreground">
                    Users will be logged out after this period of inactivity
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {hasRole('admin') && (
                  <Button onClick={handleSaveSecurity} disabled={updateSettingsMutation.isPending}>
                    {updateSettingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Settings
                  </Button>
                )}
                <Button variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                  Change Password
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Management - Admin only */}
        {hasRole('admin') && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <Database className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Data Management</CardTitle>
                <CardDescription>Backup and export options</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport('all data')}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Export All Data (CSV)
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport('students')}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Export Students
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport('financial reports')}
                >
                  <Building className="mr-2 h-4 w-4" />
                  Export Financial Reports
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="current_password">Current Password</Label>
              <div className="relative">
                <Input
                  id="current_password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm New Password</Label>
              <Input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPasswordDialogOpen(false)}
              disabled={changePasswordMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
