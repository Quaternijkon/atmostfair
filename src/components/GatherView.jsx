import React, { useState } from 'react';
import { Plus, Download, ClipboardList, CheckCircle, FileText } from './Icons';
import { useUI } from './UIComponents';

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
                 showToast(t('setGuestName') || 'Please enter name', 'error'); 
                 return;
             }
             actions.handleSubmitGather(project.id, formData, submitterName)
                .then(() => showToast(t('submitSuccess'), 'success'))
                .catch((e) => showToast(t('submitError') + ': ' + e.message, 'error'));
        }
    });
  };

  const handleExport = () => {
    // Generate CSV
    const headers = ['Name', 'Submitted At', ...fields.map(f => f.label)];
    const rows = submissions.map(s => {
        const date = new Date(s.submittedAt).toLocaleString().replace(/,/g, '');
        const values = fields.map(f => `"${(s.data[f.id] || '').replace(/"/g, '""')}"`);
        return [`"${s.name}"`, `"${date}"`, ...values].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${project.title || 'export'}_gather.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Creator / Admin Section */}
      {(isOwner || isAdmin) && !isStopped && (
        <div className="mb-8 p-6 bg-m3-surface-container rounded-2xl animate-fade-in-up">
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
                className="flex-1 px-4 py-2 rounded-lg border border-m3-outline bg-m3-surface focus:border-google-blue outline-none"
             />
             <button type="submit" className="px-5 py-2 bg-google-blue text-white rounded-lg hover:shadow-md transition-all flex items-center gap-2 font-medium">
                <Plus className="w-4 h-4" /> {t('create')}
             </button>
          </form>
           {/* List of Fields */}
          <div className="flex flex-wrap gap-2">
              {fields.map(field => (
                  <div key={field.id} className="group flex items-center gap-2 px-3 py-1.5 bg-white border border-m3-outline/20 rounded-lg text-sm shadow-sm">
                      <span className="font-medium text-m3-on-surface">{field.label}</span>
                      {/* Allow delete */}
                      <button 
                        onClick={() => actions.handleDeleteGatherField(field.id)}
                        className="text-m3-on-surface-variant hover:text-google-red p-0.5 rounded-full"
                        title="Delete field"
                      >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
                <button onClick={handleExport} className="flex items-center gap-2 text-google-blue hover:bg-google-blue/10 px-4 py-2 rounded-full transition-colors border border-transparent hover:border-google-blue/20">
                    <Download className="w-5 h-5" /> {t('exportCSV')}
                </button>
              </div>
              
              <div className="overflow-x-auto bg-white border border-m3-outline/20 rounded-xl shadow-sm">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-m3-surface-container-high text-m3-on-surface-variant font-medium">
                          <tr>
                              <th className="px-4 py-3 min-w-[120px]">Name</th>
                              {fields.map(f => <th key={f.id} className="px-4 py-3 min-w-[150px]">{f.label}</th>)}
                              <th className="px-4 py-3 w-[150px]">Time</th>
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
                                  <td className="px-4 py-3 text-xs opacity-70">{new Date(s.submittedAt).toLocaleDateString()}</td>
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
          <div className="text-center p-12 bg-m3-surface-container-high rounded-2xl opacity-70 flex flex-col items-center">
              <ClipboardList className="w-12 h-12 mb-4 opacity-50" />
              <h3 className="text-xl font-medium">{t('paused')}</h3>
              <p>{t('verifyAccess')}</p>
          </div>
      )}

      {(!isStopped || isOwner || isAdmin) && (
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-m3-outline/10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              {hasSubmitted ? (
                  <div className="text-center py-8">
                      <CheckCircle className="w-16 h-16 text-google-green mx-auto mb-4" />
                      <h2 className="text-2xl font-normal text-m3-on-surface mb-2">{t('submitSuccess')}</h2>
                      <p className="text-m3-on-surface-variant mb-8">{t('alreadySubmitted')}</p>
                      
                      {/* Show their submission */}
                      <div className="text-left max-w-md mx-auto bg-m3-surface p-6 rounded-xl border border-m3-outline/10">
                          <h4 className="font-medium mb-4 pb-2 border-b border-m3-outline/10 text-m3-primary">{t('yourResponse')}</h4>
                          <div className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="opacity-70 font-medium">Name</span>
                                <span className="text-right">{mySubmission.name}</span>
                            </div>
                            {fields.map(f => (
                                <div key={f.id} className="flex justify-between text-sm group">
                                    <span className="opacity-70 group-hover:opacity-100 transition-opacity">{f.label}</span>
                                    <span className="font-medium text-right">{mySubmission.data[f.id] || '-'}</span>
                                </div>
                            ))}
                            <div className="border-t border-m3-outline/10 pt-3 text-xs text-center opacity-50">
                                Submitted on {new Date(mySubmission.submittedAt).toLocaleString()}
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
                        <h2 className="text-2xl font-normal">{t('fillForm')}</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium mb-2 text-m3-on-surface-variant">Name / Nickname *</label>
                            <input 
                                required
                                type="text" 
                                value={submitterName}
                                onChange={e => setSubmitterName(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-m3-outline bg-m3-surface focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 outline-none transition-all"
                                placeholder={t('guestName')}
                            />
                        </div>

                        {fields.map(field => (
                            <div key={field.id}>
                                 <label className="block text-sm font-medium mb-2 text-m3-on-surface-variant">{field.label}</label>
                                 <input 
                                    type="text"
                                    value={formData[field.id] || ''}
                                    onChange={e => setFormData({ ...formData, [field.id]: e.target.value })}
                                    className="w-full px-4 py-3 rounded-lg border border-m3-outline bg-m3-surface focus:border-google-blue focus:ring-2 focus:ring-google-blue/20 outline-none transition-all"
                                    placeholder={`Enter ${field.label}`}
                                 />
                            </div>
                        ))}

                        {fields.length === 0 && (
                            <div className="text-center py-6 text-m3-on-surface-variant opacity-70 bg-m3-surface-container rounded-lg border border-dashed border-m3-outline">
                                {t('noFields')}
                            </div>
                        )}
                        
                        {fields.length > 0 && (
                            <button type="submit" className="w-full py-3 bg-google-blue text-white rounded-full font-medium shadow-elevation-1 hover:shadow-elevation-2 active:scale-[0.99] transition-all mt-4 text-lg">
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