import { Component, EnvironmentInjector, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonBadge
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { statsChart, list, bookmark, addCircle } from 'ionicons/icons';
import { StorageService } from '../core/services/storage';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [CommonModule, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
})
export class TabsPage implements OnInit {
  public environmentInjector = inject(EnvironmentInjector);
  private storageService = inject(StorageService);
  private cdr = inject(ChangeDetectorRef);

  totalSeguidos = 0;

  constructor() {
    addIcons({ statsChart, list, bookmark, addCircle });
  }

  ngOnInit() {
    this.storageService.seguidos$.subscribe(lista => {
      this.totalSeguidos = lista.length;
      this.cdr.markForCheck();
    });
  }
}

