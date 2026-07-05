import React, { useState } from 'react';
import { Plus, Download, ClipboardList, CheckCircle, FileText, X } from './Icons';
import { formatDate, formatDateTime } from '../lib/locale';
import { useUI } from './UIContext';

export default function GatherView({ user, isAdmin, project, fields = [], submissions = [], isStopped, isOwner, actions, t }) {
  const { showToast, confirm } = useUI();
  const [newField, setNewField] = useState('');
  
  // Submission Form State
  const [formData, setFormData] = useState({});
  const [submitterName, setSubmitterName] = useState(user?.displayName || '');

  const mySubmission = submissions.find(s => s.uid === user?.uid);
  const hasSubmitted = !!mySubmission;

  const handleAddField = (e) => {
    e.preventDefault();
    if (!newField.trim()) return;
    actions.handleCreateGatherField(project.id, newField.trim());
    setNewField('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    confirm({
        title: t('submit'),
        message: t('confirmSubmit'),
        confirmText: t('submit'),
        cancelText: t('cancel'),
        onConfirm: () => {
             // Validation
             if(!submitterName.trim()) {
                 showToast(t('setGuestName'), 'error');
                 return;
             }
             actions.handleSubmitGather(project.id, formData, submitterName)
                .then(() => showToast(t('submitSuccess'), 'success'))
                .catch((e) => showToast(t('errorWithMessage', { title: t('submitError'), message: e.message }), 'error'));
        }
    });
  };

  const handleExport = () => {
    // Generate CSV
    const headers = [t('nameLabel'), t('submittedAtCsv'), ...fields.map(f => f.label)];
    const rows = submissions.map(s => {
        const date = formatDateTime(s.submittedAt, t).replace(/,/g, '');
        const values = fields.map(f => `"${(s.data[f.id] || '').replace(/"/g, '""')}"`);
        return [`"${s.name}"`, `"${date}"`, ...values].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${project.title || t('exportFile')}_gather.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Creator / Admin Section */}
      {(isOwner || isAdmin) && !isStopped && (
        <div className="app-card mb-6 animate-fade-in-up p-5 sm:p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-google-blue" />
            {t('addField')}
          </h3>
          <form onSubmit={handleAddField} className="flex gap-4 mb-4">
             <input 
                type="text" 
                value={newField} 
                onChange={(e) => setNewField(e.target.value)}
                placeholder={t('fieldLabel')}
                className="app-input flex-1"
             />
             <button type="submit" className="app-button-primary">
                <Plus className="w-4 h-4" /> {t('create')}
             </button>
          </form>
           {/* List of Fields */}
          <div className="flex flex-wrap gap-2">
              {fields.map(field => (
                  <div key={field.id} className="app-chip group">
                      <span className="font-medium text-m3-on-surface">{field.label}</span>
                      {/* Allow delete */}
                      <button 
                        onClick={() => actions.handleDeleteGatherField(field.id)}
                        className="touch-target -my-2 -mr-2 inline-flex items-center justify-center rounded-full text-m3-on-surface-variant hover:text-google-red"
                        title={t('deleteField')}
                      >
                          <X className="w-3 h-3" />
                      </button>
                  </div>
              ))}
              {fields.length === 0 && <span className="text-sm text-m3-on-surface-variant opacity-70 italic">{t('noFields')}</span>}
          </div>
        </div>
      )}

      {/* Submission Status for Owner */}
      {(isOwner || isAdmin) && (
          <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-normal flex items-center gap-2">
                    <FileText className="w-6 h-6 text-m3-secondary" />
                    {t('responses')} 
                    <span className="bg-m3-secondary-container text-m3-on-secondary-container text-sm px-2 py-0.5 rounded-full">{submissions.length}</span>
                </h3>
                <button onClick={handleExport} className="app-button-quiet text-google-blue hover:bg-google-blue/10">
                    <Download className="w-5 h-5" /> {t('exportCSV')}
                </button>
              </div>
              
              <div className="app-card overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-m3-surface-container-high text-m3-on-surface-variant font-medium">
                          <tr>
                              <th className="px-4 py-3 min-w-[120px]">{t('nameLabel')}</th>
                              {fields.map(f => <th key={f.id} className="px-4 py-3 min-w-[150px]">{f.label}</th>)}
                              <th className="px-4 py-3 w-[150px]">{t('timeLabel')}</th>
                          </tr>
                      </thead>
                      <tbody>
                          {submissions.map(s => (
                              <tr key={s.id} className="border-t border-m3-outline/10 hover:bg-m3-surface-container/50">
                                  <td className="px-4 py-3 font-medium">{s.name}</td>
                                  {fields.map(f => (
                                      <td key={f.id} className="px-4 py-3 max-w-[200px] truncate" title={s.data[f.id]}>
                                          {s.data[f.id]}
                                      </td>
                                  ))}
                                  <td className="px-4 py-3 text-xs opacity-70">{formatDate(s.submittedAt, t)}</td>
                              </tr>
                          ))}
                          {submissions.length === 0 && (
                              <tr><td colSpan={fields.length + 2} className="px-4 py-8 text-center opacity-50">{t('dbEmpty')}</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* User Submission View */}
      {isStopped && !isOwner && !isAdmin && (
          <div className="app-card-quiet flex flex-col items-center p-12 text-center opacity-80">
              <ClipboardList className="w-12 h-12 mb-4 opacity-50" />
              <h3 className="text-xl font-medium">{t('paused')}</h3>
              <p>{t('verifyAccess')}</p>
          </div>
      )}

      {(!isStopped || isOwner || isAdmin) && (
          <div className="app-card animate-fade-in-up p-6 md:p-8" style={{ animationDelay: '0.2s' }}>
              {hasSubmitted ? (
                  <div className="text-center py-8">
                      <CheckCircle className="w-16 h-16 text-google-green mx-auto mb-4" />
                      <h2 className="text-2xl font-medium text-m3-on-surface mb-2">{t('submitSuccess')}</h2>
                      <p className="text-m3-on-surface-variant mb-8">{t('alreadySubmitted')}</p>
                      
                      {/* Show their submission */}
                      <div className="app-card-quiet mx-auto max-w-md p-6 text-left">
                          <h4 className="font-medium mb-4 pb-2 border-b border-m3-outline/10 text-m3-primary">{t('yourResponse')}</h4>
                          <div className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="opacity-70 font-medium">{t('nameLabel')}</span>
                                <span className="text-right">{mySubmission.name}</span>
                            </div>
                            {fields.map(f => (
                                <div key={f.id} className="flex justify-between text-sm group">
                                    <span className="opacity-70 group-hover:opacity-100 transition-opacity">{f.label}</span>
                                    <span className="font-medium text-right">{mySubmission.data[f.id] || '-'}</span>
                                </div>
                            ))}
                            <div className="border-t border-m3-outline/10 pt-3 text-xs text-center opacity-50">
                                {t('submittedOn', { date: formatDateTime(mySubmission.submittedAt, t) })}
                            </div>
                          </div>
                      </div>
                  </div>
              ) : (
                <form onSubmit={handleSubmit} className="max-w-lg mx-auto">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-full bg-google-blue/10 flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-google-blue" />
                        </div>
                        <h2 className="text-2xl font-medium">{t('fillForm')}</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="app-label">{t('nameNickname')}</label>
                            <input 
                                required
                                type="text" 
                                value={submitterName}
                                onChange={e => setSubmitterName(e.target.value)}
                                className="app-input"
                                placeholder={t('guestName')}
                            />
                        </div>

                        {fields.map(field => (
                            <div key={field.id}>
                                 <label className="app-label">{field.label}</label>
                                 <input 
                                    type="text"
                                    value={formData[field.id] || ''}
                                    onChange={e => setFormData({ ...formData, [field.id]: e.target.value })}
                                    className="app-input"
                                    placeholder={t('enterField', { field: field.label })}
                                 />
                            </div>
                        ))}

                        {fields.length === 0 && (
                            <div className="text-center py-6 text-m3-on-surface-variant opacity-70 bg-m3-surface-container rounded-lg border border-dashed border-m3-outline">
                                {t('noFields')}
                            </div>
                        )}
                        
                        {fields.length > 0 && (
                            <button type="submit" className="app-button-primary mt-4 w-full text-lg">
                                {t('submit')}
                            </button>
                        )}
                    </div>
                </form>
              )}
          </div>
      )}
    </div>
  );
}
